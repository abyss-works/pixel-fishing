-- 0047 되돌리기 — 우편 멱등 키 인덱스와 열을 지운다.
drop index if exists public.mails_user_idempotency_idx;
alter table public.mails drop column if exists idempotency_key;
