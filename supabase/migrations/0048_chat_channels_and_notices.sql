-- 채팅 3방(전체·지역·길드) 분리를 위한 채널·지역 열과 기간제 상시 공지 표를 추가한다.
-- 순수 가산 마이그레이션 — 표와 열 추가 후 코드 배포가 안전하다.

alter table public.chat_messages
  add column channel text not null default 'local' check (channel in ('global', 'local', 'guild')),
  add column region text null;

update public.chat_messages set channel = 'guild' where guild_id is not null;
update public.chat_messages set channel = 'global' where guild_id is null;

create index chat_messages_channel_id_idx on public.chat_messages (channel, id desc);
create index chat_messages_local_region_id_idx on public.chat_messages (region, id desc) where channel = 'local';

-- 기간제 상시 공지 — 읽기·쓰기 정책 없음 = 서버 전용
create table public.notices (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 600),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notices_window_idx on public.notices (ends_at, starts_at);

alter table public.notices enable row level security;
