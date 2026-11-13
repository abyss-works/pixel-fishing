-- 0036 되돌리기 — 수락 기록 표를 지운다. 지운 기록은 복구되지 않는다. 데이터가 필요하면 롤백보다 먼저 백업에서 복구한다.
drop table if exists public.consent_records;
