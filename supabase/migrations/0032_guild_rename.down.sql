-- 0032 되돌리기 — 길드의 이름 변경 시각 열과 항해일지의 이름 바꾸기 기록을 지운다. 이름 자체는 새 이름으로 남는다.
delete from public.guild_logs where kind = 'rename';
alter table public.guild_logs drop constraint if exists guild_logs_kind_check;
alter table public.guild_logs add constraint guild_logs_kind_check
  check (kind in ('join', 'leave', 'kick', 'legendary', 'named', 'donate', 'bonus-up'));
alter table public.guilds drop column if exists renamed_at;
