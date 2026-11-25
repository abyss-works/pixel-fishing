-- 우편(mails) 아이템 첨부 목록 — [{ id, qty }] jsonb 배열, 기본값은 빈 배열이다.
alter table public.mails
  add column if not exists items jsonb not null default '[]'::jsonb;
