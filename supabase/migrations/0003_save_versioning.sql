-- saves를 "덮어쓰기" 대신 "추가만"으로 전환 — 배포 중 마이그레이션 버그가 나도
-- 직전 정상 상태가 물리적으로 남아있게 한다 .
--
-- 지금까지: user_id가 PK라 유저당 딱 1행, 저장할 때마다 upsert로 값을 덮어썼다.
-- 문제: migrate()에 버그가 있는 채로 배포되면, 유저가 접속하는 순간 그 버그가 만든
-- (구조적으로는 유효하지만 값이 잘못된) 상태로 유일한 사본이 그대로 덮인다 — 복구 불가.
--
-- 대응: user_id 단일 PK를 버리고 유저당 여러 행을 허용한다. 조회는 "가장 최근 행"으로,
-- 쓰기는 항상 insert만(절대 update/overwrite 안 함). 실패해도 새 행이 안 생길 뿐 —
-- 이전 행은 그대로 있다. 값이 잘못된 행이 성공적으로 insert돼도 이전 행이 남아있어
-- (가장 최근 행을 지우거나 그 이전 행을 다시 최신으로 만들면) 손으로 복구 가능하다.
--
-- schema_version은 손으로 관리하는 컬럼이 아니라 data->>'v'에서 자동 계산되는
-- generated column — 컬럼 값과 실제 데이터가 어긋날 일이 없다. 기존 행도 지금 전부
-- v=4라 마이그레이션 실행 즉시 4로 채워진다(별도 backfill 불필요).

alter table public.saves drop constraint if exists saves_pkey;

alter table public.saves add column if not exists id bigserial;
alter table public.saves add primary key (id);

alter table public.saves
  add column if not exists schema_version int generated always as ((data->>'v')::int) stored;

-- 유저별 "가장 최근 행" 조회를 빠르게 하기 위한 인덱스
create index if not exists saves_user_latest_idx
  on public.saves (user_id, updated_at desc);
