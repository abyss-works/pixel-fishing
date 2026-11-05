-- 0029 되돌리기 — 길드 보너스 표 삭제, 항해일지의 기부·단계 상승 기록과 value 열 삭제. 스키마를 정말 되돌려야 할 때만 쓴다.
drop table if exists public.guild_bonus_donations;
drop table if exists public.guild_bonuses;
delete from public.guild_logs where kind in ('donate', 'bonus-up');
alter table public.guild_logs drop constraint if exists guild_logs_kind_check;
alter table public.guild_logs add constraint guild_logs_kind_check
  check (kind in ('join', 'leave', 'kick', 'legendary', 'named'));
alter table public.guild_logs drop column if exists value;
