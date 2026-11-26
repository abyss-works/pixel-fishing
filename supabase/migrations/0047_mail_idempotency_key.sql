-- 우편 멱등 발송 키 — (user_id, idempotency_key) 부분 유니크 인덱스로 자동 보상 중복 발송을 막는다.
alter table public.mails add column if not exists idempotency_key text;
create unique index if not exists mails_user_idempotency_idx on public.mails (user_id, idempotency_key) where idempotency_key is not null;
