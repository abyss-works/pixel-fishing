-- 관리자 우편 일괄 발송 멱등 키 저장 표 — 멀티 파드 환경에서 프로세스 메모리 대신 DB 트랜잭션으로 중복 발송을 막는다.
-- 읽기·쓰기 정책 없음 = 서버 전용.

create table if not exists public.admin_mail_idempotency (
  key text primary key,
  fingerprint text not null,
  result jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_mail_idempotency_expires_at_idx
  on public.admin_mail_idempotency (expires_at);

alter table public.admin_mail_idempotency enable row level security;
