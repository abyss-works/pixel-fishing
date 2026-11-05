-- 친구 — 닉네임으로 요청하고 상대가 수락하면 친구가 된다. 행 하나가 두 사람 사이의 관계 하나다.
-- accepted_at이 비어 있으면 요청 중, 차 있으면 친구다. 같은 두 사람 사이에는 방향과 무관하게 행이 하나뿐이다.
-- 읽기·쓰기 정책 없음 = 서버 전용(0019 mails 선례). 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.friends (
  requester_id uuid not null references auth.users(id) on delete cascade,  -- 요청한 사람
  addressee_id uuid not null references auth.users(id) on delete cascade,  -- 요청받은 사람
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table public.friends enable row level security;
-- 두 사람 사이 관계는 하나 — 반대 방향 요청도 같은 행으로 본다
create unique index friends_pair_idx on public.friends (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
-- 받은 요청·친구 목록 조회용
create index friends_addressee_idx on public.friends (addressee_id);
