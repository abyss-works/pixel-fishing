-- 0011 — PostgREST max-rows 1000 → 10000
-- 원인: fish_instances가 1000행에서 잘려 가방 1000 초과 유저의 전설이 조회에서 증발
--       api/action.ts:270 / http.ts:52 가 limit/range 없이 select('*').eq(uid) — PostgREST 기본 1000
--       쓰기는 INSERT_CHUNK 500으로 쪼개는데 읽기는 1방이라 비대칭 (incidents/2026-08-28 참고)
-- 성격: 엔진 설정 — 테이블 스키마 변경 없음, 가산 아님. 재실행 안전.
-- 적용: Supabase Dashboard > SQL Editor 에서 이 파일 그대로 실행 (service_role)
--       또는 psql -h <host> -U postgres -f 0011_pgrst_max_rows.sql
-- 확인: select useconfig from pg_db_role_setting where setrole='authenticator'::regrole;
--       select useconfig from pg_db_role_setting where setrole='anon'::regrole;
-- 롤백: alter role authenticator reset pgrst.db_max_rows; alter role anon reset pgrst.db_max_rows;

-- PostgREST가 읽는 GUC — authenticator(서버/JWT)와 anon(공개) 둘 다 올려야 한다
alter role authenticator set pgrst.db_max_rows = '10000';
alter role anon set pgrst.db_max_rows = '10000';

-- Supabase hosted에선 alter database 도 반영해 재시작 후에도 유지되는 경우가 있어 함께 설정
do $$
begin
  perform 1 from pg_roles where rolname='service_role';
  if found then
    execute 'alter role service_role set pgrst.db_max_rows = ''10000''';
  end if;
end$$;

-- 참고: supabase-js는 .select()에 limit 미지정시 서버 max-rows까지 반환한다.
--       이후 10000을 넘길 일은 bagCap 2000 + 래칫 기준으로 당분간 없으나, 넘기면
--       코드 페이징(range 루프, api/action.ts:270 / http.ts:52)을 도입해야 한다.
--       그때는 이 설정과 무관하게 1000씩 chunk fetch로 무한 확장 가능.
