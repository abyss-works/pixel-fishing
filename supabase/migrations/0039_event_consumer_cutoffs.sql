-- 이벤트 소비자별 컷오프 — 콜드 아카이브·업적 카운터 등 이벤트 소비 시스템의 실시간 기준점과 소급 진행 상태를 기록한다.
-- 읽기·쓰기 정책 없음 = 서버 전용(0019 mails 선례). 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
create table if not exists public.event_consumer_cutoffs (
  consumer_key                 text not null,
  rule_version                 integer not null check (rule_version >= 1),
  live_since_event_id          bigint,
  live_since_at                timestamptz,
  backfilled_through_event_id  bigint not null default 0,
  backfill_target_event_id     bigint,
  backfill_status              text not null default 'pending'
    check (backfill_status in ('pending', 'running', 'completed', 'superseded')),
  notes                        jsonb not null default '{}'::jsonb,
  updated_at                   timestamptz not null default now(),
  primary key (consumer_key, rule_version)
);

alter table public.event_consumer_cutoffs enable row level security;
