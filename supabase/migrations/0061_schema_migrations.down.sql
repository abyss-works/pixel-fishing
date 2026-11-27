-- 0061 되돌림 — 적용 이력 ledger를 지운다.
-- 이 표를 지우면 이미 적용된 마이그레이션을 runner가 다시 적용하려 할 수 있으므로,
-- 되돌린 뒤에는 runner를 실행하기 전에 운영 절차에 따라 적용 이력을 먼저 복구해야 한다.

drop table if exists public.schema_migrations;
