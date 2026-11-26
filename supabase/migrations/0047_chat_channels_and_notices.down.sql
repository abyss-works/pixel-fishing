-- 0047 되돌림 — 공지 표와 채팅 채널·지역 열 및 인덱스를 제거한다.
drop index if exists public.notices_window_idx;
drop table if exists public.notices;

drop index if exists public.chat_messages_local_region_id_idx;
drop index if exists public.chat_messages_channel_id_idx;

alter table public.chat_messages
  drop column if exists region,
  drop column if exists channel;
