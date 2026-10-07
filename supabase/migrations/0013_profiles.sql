-- profiles — 닉네임 저장소 (next.md #2, 전시·랭킹의 전제).
-- user_metadata가 아니라 테이블인 이유: lower() UNIQUE 강제 + 공개 읽기가 필요해서다.
-- 쓰기는 서버(service role)만 — RLS 쓰기 정책 없음. 읽기는 본인만.
-- 전체 읽기는 랭킹(#4) 때 연다. 순수 가산 — 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create unique index profiles_nickname_lower_idx on public.profiles (lower(nickname));
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);
