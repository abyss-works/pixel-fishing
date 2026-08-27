-- 0010 되돌리기 — 관리자 읽기 계층 전면 제거 (기반 테이블은 건드리지 않았다)
drop function if exists public.fn_user_events(uuid, int);
drop view  if exists public.v_events_recent;
drop view  if exists public.v_dex_mismatch;
drop view  if exists public.v_import_log;
drop view  if exists public.v_spam_flags;
drop view  if exists public.v_catch_quality;
drop view  if exists public.v_economy_daily;
drop view  if exists public.v_retention_cohorts;
drop view  if exists public.v_daily_active;
drop view  if exists public.v_admin_users;
drop function if exists public.is_admin();
drop table if exists public.admins;
