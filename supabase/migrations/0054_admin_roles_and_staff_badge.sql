-- 관리자 역할 분리(admin/maintainer), 채팅 운영진 배지 노출 설정(show_staff_badge), 불변 감사 로그(admin_audit_logs)를 추가한다.
-- 순수 가산 마이그레이션 — 열·표 추가 후 코드 배포가 안전하다.

alter table public.admins
  add column if not exists role text not null default 'admin' check (role in ('admin', 'maintainer')),
  add column if not exists show_staff_badge boolean not null default false;

-- 관리자·메인테이너 조치 감사 로그 — events 7일 콜드 아카이브와 분리해 보관한다(서버 전용)
create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('admin', 'maintainer')),
  action text not null,
  target_id uuid,
  reason text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

alter table public.admin_audit_logs enable row level security;
