-- 인증 계정 표를 Better Auth 표로 바꾼다. 사용자 id(UUID)는 그대로 유지한다.
-- 기존 auth.users는 auth.supabase_users로 이름을 바꿔 남기고, 같은 이름의 새 표 auth.users를 만든다.
-- 공개 표의 외래 키는 새 auth.users를 가리키게 다시 건다. 기존 세션은 옮기지 않는다(모든 로그인이 풀린다).
-- 익명 계정의 이메일은 비어 있을 수 없어 "<id>@anonymous.invalid" 자리표시 주소를 넣는다.
-- 이메일 계정의 bcrypt 해시는 자격 계정(provider_id 'credential')의 password로 옮긴다.

alter table auth.users rename to supabase_users;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_user_id_idx on auth.sessions (user_id);

create table auth.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounts_user_id_idx on auth.accounts (user_id);

create table auth.verifications (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index verifications_identifier_idx on auth.verifications (identifier);

insert into auth.users (id, email, email_verified, is_anonymous, created_at, updated_at)
select u.id,
       coalesce(lower(u.email), u.id::text || '@anonymous.invalid'),
       -- 확인 시각 열은 인증 서버 버전에 따라 없을 수 있어 행 JSON에서 읽는다
       (to_jsonb(u) ->> 'email_confirmed_at') is not null,
       u.email is null or coalesce(u.is_anonymous, false),
       coalesce(u.created_at, now()),
       coalesce(u.updated_at, u.created_at, now())
from auth.supabase_users u;

insert into auth.accounts (user_id, account_id, provider_id, password, created_at, updated_at)
select u.id, u.id::text, 'credential', u.encrypted_password,
       coalesce(u.created_at, now()), coalesce(u.updated_at, u.created_at, now())
from auth.supabase_users u
where u.email is not null and coalesce(u.encrypted_password, '') <> '';

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and c.confrelid = 'auth.supabase_users'::regclass and n.nspname = 'public'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s', r.tbl, r.conname,
      replace(r.def, 'auth.supabase_users', 'auth.users'));
  end loop;
end $$;

-- 관리자 사용자 명부 뷰를 새 인증 표 기준으로 다시 만든다(열 이름과 순서는 그대로).
-- 게스트의 자리표시 이메일은 null로 보이고, 마지막 로그인은 그 계정 세션의 마지막 사용 시각이다.
drop view public.v_admin_users;
create view public.v_admin_users as
select
  u.id                       as user_id,
  case when u.is_anonymous then null else u.email end as email,
  u.is_anonymous,
  u.created_at               as signed_up_at,
  (select max(s.updated_at) from auth.sessions s where s.user_id = u.id) as last_sign_in_at,
  c.gold, c.fame, c.boat, c.rod,
  c.data -> 'location' ->> 'kind' as location_kind,
  c.data -> 'location' ->> 'id'   as location_id,
  c.data -> 'visited'             as visited,
  c.restricted,
  c.version                  as save_version,
  c.updated_at               as last_action_at
from auth.users u
left join public.saves_current c on c.user_id = u.id
where public.is_admin();
revoke all on public.v_admin_users from anon;
grant select on public.v_admin_users to authenticated;
