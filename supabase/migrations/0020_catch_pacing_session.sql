-- 캐치 간격과 활성 창 — 같은 계정의 캐치 속도를 낚시 한 사이클로 묶고, 계정당 게임 창을 하나로 제한한다.
-- last_catch_at: 직전 캐치가 확정된 시각. 다음 캐치가 최소 사이클보다 이르면 서버가 429로 거부한다.
-- active_client: 마지막으로 접속(boot)한 창의 식별자. 다른 창의 상태 변경 액션은 서버가 423으로 거부한다.
-- 두 열 모두 서버 액션 처리기만 쓴다. 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
alter table public.saves_current
  add column if not exists last_catch_at timestamptz,
  add column if not exists active_client text;
