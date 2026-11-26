-- 0046 되돌리기 — 확장 운세 행을 제거한 뒤 3종 kind와 index in (3, 5) 제약으로 복구한다.
delete from public.daily_fortunes where kind not in ('fish', 'gold', 'shadow');

alter table public.daily_fortunes drop constraint if exists daily_fortunes_index_check;
alter table public.daily_fortunes add constraint daily_fortunes_index_check
  check (index in (3, 5));

alter table public.daily_fortunes drop constraint if exists daily_fortunes_kind_check;
alter table public.daily_fortunes add constraint daily_fortunes_kind_check
  check (kind in ('fish', 'gold', 'shadow'));
