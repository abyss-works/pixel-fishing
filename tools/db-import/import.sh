#!/bin/sh
# Supabase 덤프(DB 백업 워크플로의 data.sql·counts.tsv)를 빈 Postgres로 옮긴다.
# 1단계: Supabase 역할 → 호환 객체 → 마이그레이션 0001~0020으로 스키마를 만든다.
# 2단계: 덤프에서 auth.users와 1단계가 만든 public 표의 데이터만 넣고, 마이그레이션 0021 이후를 적용한 뒤 소유자를 넘긴다.
# 마이그레이션 일부가 Supabase 역할 설정을 바꿔 슈퍼유저로 적용하고, 끝에 객체 소유자를 앱 사용자로 넘긴다.
# 마이그레이션이 만들지 않는 public 표(수동으로 만든 표)는 옮기지 않고 목록으로 알린다. 그 데이터는 덤프에 남는다.
# 끝나면 옮긴 표의 행 수를 덤프의 counts.tsv와 대조한다. 실패하면 대상 DB를 지우고 다시 실행한다.
#
# 환경 변수
#   TARGET_URL      대상 DB의 슈퍼유저 접속 URI. 데이터베이스는 앱 DB여야 한다
#   APP_ROLE        객체를 소유할 앱 사용자. 예: app
#   DUMP_DIR        백업을 푼 디렉터리(data.sql, counts.tsv). 비우면 데이터 없이 스키마만 만든다
#   MIGRATIONS_DIR  번호 SQL 마이그레이션 디렉터리
#   TOOL_DIR        이 스크립트와 호환 SQL이 있는 디렉터리
set -eu

: "${TARGET_URL:?}" "${APP_ROLE:?}" "${MIGRATIONS_DIR:?}" "${TOOL_DIR:?}"
DUMP_DIR=${DUMP_DIR:-}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
TAB=$(printf '\t')

existing=$(psql "$TARGET_URL" -tAc "select count(*) from pg_tables where schemaname in ('public', 'auth')")
if [ "$existing" != "0" ]; then
  echo "대상 DB에 public 또는 auth 표가 이미 있습니다(${existing}개). 빈 DB에만 적용합니다." >&2
  exit 1
fi

pre=""
post=""
for f in $(ls "$MIGRATIONS_DIR" | grep -E '^[0-9]{4}_.+\.sql$' | grep -v '\.down\.sql$' | sort); do
  if [ "${f%%_*}" -lt 21 ]; then pre="$pre -f $MIGRATIONS_DIR/$f"; else post="$post -f $MIGRATIONS_DIR/$f"; fi
done

# shellcheck disable=SC2086 # 마이그레이션 목록은 공백으로 나눈 psql 인자다
psql "$TARGET_URL" --single-transaction -v ON_ERROR_STOP=1 -q \
  -f "$TOOL_DIR/supabase-roles.sql" \
  -f "$TOOL_DIR/supabase-compat.sql" \
  $pre

# 옮길 표: auth.users와, 1단계 뒤 대상에 있는 public 표
psql "$TARGET_URL" -tAc "select format('\"public\".\"%s\"', tablename) from pg_tables where schemaname = 'public'" > "$WORK/tables"
echo '"auth"."users"' >> "$WORK/tables"

if [ -z "$DUMP_DIR" ]; then
  : > "$WORK/data.sql"
  : > "$WORK/counts.tsv"
else
  cp "$DUMP_DIR/counts.tsv" "$WORK/counts.tsv"
  awk -v list="$WORK/tables" '
  BEGIN { while ((getline t < list) > 0) want[t] = 1 }
  /^COPY / { keep = ($2 in want); if (keep) print; inblock = 1; next }
  inblock { if (keep) print; if ($0 == "\\.") inblock = 0; next }
  /^SELECT pg_catalog\.setval\(.\"public\"\./ { print }
' "$DUMP_DIR/data.sql" > "$WORK/data.sql"
fi

skipped=$(awk -F "$TAB" -v list="$WORK/tables" '
  BEGIN { while ((getline t < list) > 0) want[t] = 1 }
  $1 ~ /^"public"\./ && !($1 in want) { printf "%s(%s행) ", $1, $2 }
' "$WORK/counts.tsv")
[ -z "$skipped" ] || echo "마이그레이션에 없어 옮기지 않은 표: $skipped"

# shellcheck disable=SC2086
psql "$TARGET_URL" --single-transaction -v ON_ERROR_STOP=1 -q \
  -c 'set session_replication_role = replica' \
  -f "$WORK/data.sql" \
  $post \
  -c "set import.app_role = '$APP_ROLE'" \
  -f "$TOOL_DIR/owner.sql"

fail=0
while IFS="$TAB" read -r table expected; do
  grep -qxF "$table" "$WORK/tables" || continue
  if [ "$table" = '"auth"."users"' ]; then tables='auth.supabase_users auth.users'; else tables=$table; fi
  for t in $tables; do
    actual=$(psql "$TARGET_URL" -tAc "select count(*) from $t")
    if [ "$actual" != "$expected" ]; then
      echo "$t: 덤프 ${expected}행, 옮긴 결과 ${actual}행" >&2
      fail=1
    fi
  done
done < "$WORK/counts.tsv"
[ "$fail" = 0 ] || exit 1
if [ -z "$DUMP_DIR" ]; then echo "스키마를 만들었습니다(데이터 없음)."; else echo "옮기기 완료: 옮긴 표의 행 수가 덤프와 같습니다."; fi
