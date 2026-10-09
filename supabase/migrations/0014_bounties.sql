-- 바운티 헌팅 저장소 (spec/bounty-hunting.md).
-- 라이선스 소유·일일 수주 이력·의뢰 진행 3 테이블.
-- 쓰기는 서버(service role)만 — RLS 쓰기 정책 없음. 읽기는 본인만 (0013 profiles 패턴).
-- 순수 가산 — 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.bounty_licenses (
  user_id uuid not null references auth.users(id) on delete cascade,
  zone text not null,                       -- pacific · seasia · indian (1-4는 템플릿 예시)
  granted_at timestamptz not null default now(),
  primary key (user_id, zone)               -- 해역당 1 라이선스
);
alter table public.bounty_licenses enable row level security;
create policy "bounty_licenses_select_own" on public.bounty_licenses
  for select using (auth.uid() = user_id);

create table public.bounty_accepts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  zone text not null,
  port text not null,                       -- harbor · manila · colombo (고향 제외)
  quest_id text not null,                   -- src/data/bounties.ts의 의뢰 id (Task 2 정의)
  accepted_at timestamptz not null default now()
);
alter table public.bounty_accepts enable row level security;
create policy "bounty_accepts_select_own" on public.bounty_accepts
  for select using (auth.uid() = user_id);
-- 일일 상한 집계용 (통합 3회 + 항구별 1회 — KST 날짜 경계는 서버가 판단한다)
create index bounty_accepts_user_accepted_idx on public.bounty_accepts (user_id, accepted_at desc);

create table public.bounty_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  zone text not null,
  quest_id text not null,
  progress integer not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, quest_id)            -- 1인 1진행 보장
);
alter table public.bounty_progress enable row level security;
create policy "bounty_progress_select_own" on public.bounty_progress
  for select using (auth.uid() = user_id);
