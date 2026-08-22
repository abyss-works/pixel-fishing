-- 0006 롤백 — records는 순수 가산이라 되돌려도 세이브(saves_current/saves)와 events는 무손.
-- 통계만 소실되며, 재적용 후 각 유저의 다음 캐치가 절대값 upsert로 자가 치유한다.
drop table if exists public.records;
