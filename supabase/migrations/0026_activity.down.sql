-- 0026 되돌리기 — 접속 세션·활동일·일별 집계 테이블 삭제. 가산 마이그레이션이라 down은
-- 스키마를 정말 되돌려야 할 때만 쓴다.
drop table if exists public.daily_stats;
drop table if exists public.user_active_days;
drop table if exists public.play_sessions;
