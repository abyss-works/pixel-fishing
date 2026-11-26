-- 앱 서버 HTTP 응답 일별 지표 — KST 하루·경로 묶음별 총 요청, 426 구버전 거부, 429 레이트리밋 거부, 5xx 서버 오류 건수를 누적한다.
-- 클러스터 앞단(ingress-nginx)에서 차단된 429 응답은 앱 서버에 도달하지 않으므로 앱 서버 통과 요청 기준이다.
-- 읽기·쓰기 정책 없음 = 서버 전용. 순수 가산 마이그레이션이다.

create table public.http_metrics_daily (
  day date not null,
  route_group text not null check (route_group in ('action', 'auth', 'admin', 'api', 'web')),
  total bigint not null default 0 check (total >= 0),
  status_426 bigint not null default 0 check (status_426 >= 0),
  status_429 bigint not null default 0 check (status_429 >= 0),
  status_5xx bigint not null default 0 check (status_5xx >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, route_group)
);

alter table public.http_metrics_daily enable row level security;
