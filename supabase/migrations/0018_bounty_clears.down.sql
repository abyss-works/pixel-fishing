-- 0018 되돌리기 — 클리어 기록 테이블 삭제. 가산 마이그레이션이라 down은
-- 스키마를 정말 되돌려야 할 때만 쓴다.
drop table if exists public.bounty_clears;
