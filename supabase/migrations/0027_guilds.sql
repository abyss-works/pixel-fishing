-- 길드 — 계정 유저의 모임과 길드 채팅. 길드장이 발급한 초대 코드로만 들어오고, 인원 상한과 권한은 서버가 판정한다.
-- 읽기·쓰기 정책 없음 = 서버 전용(0019 mails 선례). 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 16),  -- 닉네임 규칙과 같다(서버가 검사한다)
  created_at timestamptz not null default now()
);
alter table public.guilds enable row level security;
-- 이름은 대소문자를 무시하고 겹치지 않는다
create unique index guilds_name_lower_idx on public.guilds (lower(name));

-- 길드원 — 길드와 사람 사이 행 하나. left_at이 차 있으면 떠난 선원이다(기록은 길드에 남는다).
-- 같은 길드에 다시 들어오면 같은 행을 되살린다. 역할의 정본은 이 표 하나다.
create table public.guild_members (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (guild_id, user_id),
  check (left_at is null or role = 'member')  -- 떠난 선원은 길드장이 아니다
);
alter table public.guild_members enable row level security;
-- 한 사람은 길드 하나에만 속한다
create unique index guild_members_one_guild_idx on public.guild_members (user_id) where left_at is null;
-- 길드장은 길드마다 하나다
create unique index guild_members_one_leader_idx on public.guild_members (guild_id) where role = 'leader';

-- 초대 코드 — 길드마다 하나. 다시 발급하면 바뀌고, 만료 전까지 여러 사람이 쓸 수 있다.
create table public.guild_invites (
  guild_id uuid primary key references public.guilds(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null
);
alter table public.guild_invites enable row level security;

-- 길드 채팅 — 월드 채팅과 같은 표에 둔다. guild_id가 비어 있으면 월드 채팅, 차 있으면 그 길드의 채팅이다.
-- 보관 기간 정리와 계정 정리는 월드 채팅과 같은 경로를 탄다. 길드가 없어지면 그 길드의 채팅도 지운다.
alter table public.chat_messages add column guild_id uuid references public.guilds(id) on delete cascade;
create index chat_messages_guild_idx on public.chat_messages (guild_id, id) where guild_id is not null;
