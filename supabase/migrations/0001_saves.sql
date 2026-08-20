-- 세이브 동기화 테이블 (P1) 
-- 유저당 1행, RLS로 본인 행만 읽고 쓸 수 있다.
create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

create policy "own save"
  on public.saves
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
