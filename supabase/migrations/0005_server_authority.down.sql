-- 0005 롤백 — 서버 권위 테이블 제거.
--
-- ⛔ 아래 스냅샷 쿼리는 **0006 이전 전용**이다. 0006이 적용된 DB에서 그대로 돌리면
--    껍데기만 뜬다 — saves_current.data 블롭에는 gold·fame·boat·rod(스칼라 컬럼)도,
--    bag·exhibit(fish_instances)도, dex(records)도 없다. 자산·가방·도감이 통째로 빠진다.
--    0006 이후의 롤백 절차 정본은 mgmt/status.md 2.5절이다.
--
-- (0006 이전) ⚠ 실행 전에 saves_current의 최신 상태를 saves로 스냅샷할 것
-- (스냅샷 주기 사이의 진행이 유실된다):
--   insert into public.saves (user_id, data, updated_at)
--   select user_id, data, updated_at from public.saves_current;
drop table if exists public.events;
drop table if exists public.saves_current;
