-- 도전권 저장소 (spec/bounty-hunting.md 챌린지절).
-- 수주 중인 네임드 의뢰의 조우(1/5000)가 도전권을 발급한다. 의뢰당 1행, 재조우면 갱신.
-- 쓰기는 서버(service role)만 — RLS 쓰기 정책 없음. 읽기는 본인만 (0014 패턴).
-- 만료 판정은 사용 시점(서버 시각)에 한다 — 스위퍼 없음.
-- 순수 가산 — 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.bounty_tickets (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id text not null,                       -- src/data/bounties.ts의 네임드 의뢰 id
  issued_at timestamptz not null default now(),
  primary key (user_id, quest_id)               -- 1인 1의뢰 1도전권
);
alter table public.bounty_tickets enable row level security;
create policy "bounty_tickets_select_own" on public.bounty_tickets
  for select using (auth.uid() = user_id);
