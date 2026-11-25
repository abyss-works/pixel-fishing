-- 0043 되돌리기 — 우편 아이템 첨부 열을 지운다.
alter table public.mails drop column if exists items;
