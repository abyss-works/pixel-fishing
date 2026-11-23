-- 0038 되돌리기 — 자유 강화 단계 열과 항해일지의 자유 강화·초기화 기록을 지운다.
delete from public.guild_logs where kind in ('enhance', 'enhance-reset');
alter table public.guild_logs drop constraint if exists guild_logs_kind_check;
alter table public.guild_logs add constraint guild_logs_kind_check
  check (kind in ('join', 'leave', 'kick', 'legendary', 'named', 'donate', 'bonus-up', 'rename'));
alter table public.guild_bonuses drop column if exists enhance_rank;
