-- 0054 되돌림 — 감사 로그 표와 관리자 역할·채팅 배지 열을 제거한다.
drop index if exists public.admin_audit_logs_created_at_idx;
drop table if exists public.admin_audit_logs;

alter table public.admins
  drop column if exists show_staff_badge,
  drop column if exists role;
