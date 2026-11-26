-- 우편(mails) 모자 첨부 목록 — ["santa-hat", ...] jsonb 배열, 기본값은 빈 배열이다.
alter table public.mails
  add column if not exists hats jsonb not null default '[]'::jsonb;
