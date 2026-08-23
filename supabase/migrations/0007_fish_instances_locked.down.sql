-- ⚠️ 되돌리면 개체별 잠금이 전부 사라진다(어떤 개체를 지키려 했는지 복구 불가).
-- 코드가 이 컬럼을 쓰고 있으면 INSERT가 전부 실패한다 — 코드를 먼저 되돌릴 것.
alter table public.fish_instances drop column if exists locked;
