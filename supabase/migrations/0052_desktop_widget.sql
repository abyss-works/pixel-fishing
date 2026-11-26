-- 데스크톱 낚시 모니터 위젯: 마지막 낚시 해역, PKCE 일회용 인증 코드, 위젯 전용 Bearer 토큰 표를 추가한다.
-- 순수 가산 마이그레이션 — 열·표 추가 후 서버 배포가 안전하다.

alter table public.saves_current
  add column if not exists last_spot text null;

-- PKCE 일회용 인증 코드 — 읽기·쓰기 정책 없음 = 서버 전용
create table if not exists public.widget_auth_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_challenge text not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists widget_auth_codes_expires_idx
  on public.widget_auth_codes (expires_at);

alter table public.widget_auth_codes enable row level security;

-- 위젯 전용 장기 Bearer 토큰 — 읽기·쓰기 정책 없음 = 서버 전용
create table if not exists public.widget_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_version text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists widget_tokens_user_idx
  on public.widget_tokens (user_id);

create index if not exists widget_tokens_expires_idx
  on public.widget_tokens (expires_at);

alter table public.widget_tokens enable row level security;
