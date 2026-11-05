-- 개인 차단 — 계정이 다른 계정을 차단한 목록. 차단하면 그 사람의 채팅을 받지 않고, 친구 관계가 끊기며, 친구 요청도 받지 않는다.
-- 읽기·쓰기 정책 없음 = 서버 전용(0019 mails 선례). 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.blocks (
  user_id uuid not null references auth.users(id) on delete cascade,     -- 차단한 사람
  blocked_id uuid not null references auth.users(id) on delete cascade,  -- 차단당한 사람
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  check (user_id <> blocked_id)
);
alter table public.blocks enable row level security;
-- 나를 차단한 사람 조회용(친구 요청 거부 판정)
create index blocks_blocked_idx on public.blocks (blocked_id);
