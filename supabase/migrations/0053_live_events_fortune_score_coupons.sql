-- 라이브 이벤트(live_events, event_trio_progress, event_championship_scores, event_draws),
-- 일일 운세 점수(daily_fortunes.score), 동적 쿠폰 기간/한도/아이템·사용 이력(coupons, coupon_redemptions)을 추가한다.
-- 순수 가산 마이그레이션 — 표와 열 추가 후 코드 배포가 안전하다.

alter table public.daily_fortunes
  add column if not exists score smallint check (score is null or score between 81 and 100);

alter table public.coupons
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  add column if not exists per_account_limit integer not null default 1 check (per_account_limit > 0);

-- 동적 쿠폰 사용 이력 — 계정별·전체 사용 한도 집계용 (서버 전용)
create table public.coupon_redemptions (
  id bigint generated always as identity primary key,
  code text not null references public.coupons(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now()
);

create index coupon_redemptions_code_user_idx on public.coupon_redemptions (code, user_id);
create index coupon_redemptions_user_idx on public.coupon_redemptions (user_id, redeemed_at desc);

alter table public.coupon_redemptions enable row level security;

-- 기간제 라이브 이벤트 정의 (서버 전용)
create table public.live_events (
  id text primary key,
  kind text not null check (kind in ('trio', 'championship', 'draw')),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index live_events_active_window_idx on public.live_events (active, ends_at, starts_at);

alter table public.live_events enable row level security;

-- 이벤트 1(트리오) 진행·완료·보상 수령 상태 (서버 전용)
create table public.event_trio_progress (
  event_id text not null references public.live_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  counts jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.event_trio_progress enable row level security;

-- 이벤트 2(챔피언십) 점수·도감·모자 지급·미정산 보상 누적 (서버 전용)
create table public.event_championship_scores (
  event_id text not null references public.live_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  best_fish_id text,
  best_fish_score integer not null default 0 check (best_fish_score >= 0),
  catches integer not null default 0 check (catches >= 0),
  dex jsonb not null default '{}'::jsonb,
  hats_granted jsonb not null default '[]'::jsonb,
  pending_gold integer not null default 0 check (pending_gold >= 0),
  pending_fame integer not null default 0 check (pending_fame >= 0),
  settled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_championship_scores_rank_idx
  on public.event_championship_scores (event_id, score desc, updated_at asc);

alter table public.event_championship_scores enable row level security;

-- 이벤트 추첨·당첨 결과 기록 (서버 전용)
create table public.event_draws (
  id bigint generated always as identity primary key,
  event_id text not null references public.live_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_kind text not null check (reward_kind in ('gold', 'item', 'hat', 'none')),
  reward_id text,
  reward_qty integer not null default 0 check (reward_qty >= 0),
  gold integer not null default 0 check (gold >= 0),
  reward_pin text,
  reward_expires_at text,
  mail_id bigint,
  seed text not null default '',
  drawn_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index event_draws_event_user_idx on public.event_draws (event_id, user_id, created_at desc);

alter table public.event_draws enable row level security;
