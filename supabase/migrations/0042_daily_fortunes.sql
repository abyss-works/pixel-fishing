-- 로그인 계정의 날짜별 운세 이력 — 서버가 당일 운세를 1일 1행으로 기록하고 주간 누적 조회에 쓴다.
-- 게스트 계정은 저장하지 않는다. 읽기·쓰기 정책 없음 = 서버 전용.
create table public.daily_fortunes (
  user_id uuid not null references auth.users(id) on delete cascade,
  day text not null,
  kind text not null check (kind in ('fish', 'gold', 'shadow')),
  index smallint not null check (index in (3, 5)),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_fortunes enable row level security;
create index if not exists daily_fortunes_user_day_idx on public.daily_fortunes (user_id, day desc);
