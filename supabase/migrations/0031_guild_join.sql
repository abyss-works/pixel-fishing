-- 길드 가입 방식 — 길드마다 바뀌지 않는 고유 코드, 가입 방식(자유, 승인, 닫힘), 초대 링크의 권유 문구, 가입 신청 표.
-- 24시간 초대 코드(guild_invites)는 고유 코드로 대신하고 지운다. 기존 길드는 쓰던 초대 코드가 있으면 그 코드를,
-- 없으면 새 코드를 고유 코드로 받는다. 읽기·쓰기 정책 없음 = 서버 전용(0019 mails 선례).
alter table public.guilds
  add column code text,
  add column join_mode text not null default 'approval' check (join_mode in ('open', 'approval', 'closed')),
  add column pitch text check (pitch is null or char_length(pitch) between 1 and 60);

update public.guilds g set code = i.code from public.guild_invites i where i.guild_id = g.id;

-- 코드 글자는 규칙 모듈과 같다(헷갈리는 0 O 1 I L을 뺀 대문자와 숫자 8자)
do $$
declare
  r record;
  c text;
begin
  for r in select id from public.guilds where code is null loop
    loop
      select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
        into c from generate_series(1, 8);
      exit when not exists (select 1 from public.guilds where code = c);
    end loop;
    update public.guilds set code = c where id = r.id;
  end loop;
end $$;

alter table public.guilds alter column code set not null;
create unique index guilds_code_idx on public.guilds (code);

drop table public.guild_invites;

-- 가입 신청 — 한 사람은 한 번에 한 길드에만 신청한다. 7일이 지난 신청은 읽을 때 거르고, 쓸 때 지운다.
create table public.guild_join_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.guild_join_requests enable row level security;
-- 길드장의 신청 목록 조회용
create index guild_join_requests_guild_idx on public.guild_join_requests (guild_id, created_at);
