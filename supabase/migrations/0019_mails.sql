-- 우편함 — 운영자가 플레이어에게 보내는 우편(제목·본문·골드). 유효기간이 없고 지우지 않는 이력이다.
-- 읽기·쓰기 정책 없음 = service role 전용(0009 reliefs 선례). 플레이어의 목록·읽음은 우편 서버 함수가,
-- 골드 받기는 게임 액션의 확정 문장이 쓴다. 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.mails (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  gold bigint not null default 0 check (gold >= 0),  -- 0이면 글만 있는 우편
  created_at timestamptz not null default now(),
  read_at timestamptz,                               -- 처음 열어 본 시각
  claimed_at timestamptz                             -- 골드를 받은 시각(골드 0이면 비어 있다)
);
alter table public.mails enable row level security;
-- 본인 목록(최근 순) 조회용
create index mails_user_created_idx on public.mails (user_id, created_at desc);
