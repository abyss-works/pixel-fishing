-- 업적 카운터 표 — 사용자별, 키별 누적 정수다. 카운터는 액션 확정 문장 안에서 상태 변경과
-- 원자적으로 함께 오른다. 계정을 지우면 연쇄 삭제로 함께 지운다. RLS를 켜고 정책은 두지 않아
-- 서버 전용이다 — 값은 서버 읽기·상태 패치가 싣고 클라이언트는 표를 직접 읽지 않는다.
-- 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.achievement_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value bigint not null default 0 check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.achievement_counters enable row level security;

-- 업적 카운터를 올린 이벤트의 표시 — counted=false 행은 카운터 도입 전 이벤트의 1회 소급에만 쓴다.
alter table public.events add column counted boolean not null default false;
