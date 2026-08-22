-- 0005 롤백 — 서버 권위 테이블 제거. ⚠ 실행 전에 saves_current의 최신 상태를 saves로
-- 스냅샷할 것 (스냅샷 주기 사이의 진행이 유실된다):
--   insert into public.saves (user_id, data, updated_at)
--   select user_id, data, updated_at from public.saves_current;
drop table if exists public.events;
drop table if exists public.saves_current;
