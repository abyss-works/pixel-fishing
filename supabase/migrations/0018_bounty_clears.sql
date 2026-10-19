-- 바운티 헌팅 클리어 기록 — 하루 한도를 수주가 아니라 클리어로 센다.
-- 클리어 = 수배판에서 보상을 받은 일반 의뢰의 납품, 네임드 토벌의 보상 받기. 지우지 않는 이력이라
-- 종류별 하루 횟수는 하루 경계(KST 04:00, 서버가 정한다) 이후의 행 수다.
-- 보상을 주는 확정 문장과 같은 문장에서 서버(service role)만 쓴다 — RLS 쓰기 정책 없음.
-- 읽기는 본인만 (0014 패턴). 순수 가산 — 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.bounty_clears (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('general', 'named')),  -- 일반 의뢰 · 네임드 토벌
  quest_id text not null,                                   -- 클리어한 의뢰 id
  cleared_at timestamptz not null default now()
);
alter table public.bounty_clears enable row level security;
create policy "bounty_clears_select_own" on public.bounty_clears
  for select using (auth.uid() = user_id);
-- 일일 한도 집계용 (유저의 경계 이후 클리어)
create index bounty_clears_user_cleared_idx on public.bounty_clears (user_id, cleared_at desc);
