-- 길드 스킬 자유 강화 — 보너스별 자유 강화 단계 열과 항해일지의 자유 강화·초기화 기록.
-- 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
alter table public.guild_bonuses
  add column enhance_rank smallint not null default 0 check (enhance_rank between 0 and 5);

alter table public.guild_logs drop constraint guild_logs_kind_check;
alter table public.guild_logs add constraint guild_logs_kind_check
  check (kind in ('join', 'leave', 'kick', 'legendary', 'named', 'donate', 'bonus-up', 'rename', 'enhance', 'enhance-reset'));
