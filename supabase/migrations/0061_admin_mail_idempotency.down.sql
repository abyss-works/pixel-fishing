-- 0061 되돌림 — 관리자 우편 발송 멱등 키 저장 표를 제거한다.
drop table if exists public.admin_mail_idempotency;
