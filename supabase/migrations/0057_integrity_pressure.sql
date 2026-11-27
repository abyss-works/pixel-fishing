-- 계정별 추첨 보정 상태와 그 변화 근거 — 순수 가산 마이그레이션이다.
-- 읽기·쓰기 정책 없음 = 서버 전용.

create table if not exists public.integrity_states (
  user_id uuid primary key,
  pressure double precision not null default 0 check (pressure >= 0),
  stage smallint not null default 0 check (stage in (0, 1, 2)),
  samples jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.integrity_states enable row level security;

create table if not exists public.integrity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  detector text not null,
  signal jsonb not null,
  pressure_before double precision not null check (pressure_before >= 0),
  pressure_after double precision not null check (pressure_after >= 0),
  stage_before smallint not null check (stage_before in (0, 1, 2)),
  stage_after smallint not null check (stage_after in (0, 1, 2)),
  created_at timestamptz not null default now()
);

alter table public.integrity_events enable row level security;

create index if not exists integrity_events_user_created_idx on public.integrity_events (user_id, created_at desc);
create index if not exists integrity_events_created_idx on public.integrity_events (created_at desc);
create index if not exists integrity_states_stage_idx on public.integrity_states (stage);
