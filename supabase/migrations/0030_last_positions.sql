-- 마지막 위치 — 계정마다 바다 지역 안에서 마지막으로 있던 좌표 한 행. 다시 접속하면 이 자리에서 시작한다.
-- 실시간 채널이 연결이 끊길 때와 움직이는 동안 일정 간격으로 쓴다. 저장 상태(saves_current)와 별개인 표시용 기록이라
-- 게임 진행 판정에 쓰지 않는다. 읽기·쓰기 정책 없음 = 서버 전용(0019 mails 선례). 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.last_positions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  region text not null,
  x real not null,
  y real not null,
  updated_at timestamptz not null default now()
);
alter table public.last_positions enable row level security;
