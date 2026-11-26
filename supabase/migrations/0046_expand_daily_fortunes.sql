-- 일일 운세 이력(daily_fortunes) kind 제약을 12종 정본 키로 확장하고,
-- 3등급 희귀 대길(golden-scale, mirage, grand-catch)은 강도 index = 5만 허용한다.
alter table public.daily_fortunes drop constraint if exists daily_fortunes_kind_check;
alter table public.daily_fortunes add constraint daily_fortunes_kind_check
  check (kind in (
    'fish', 'gold', 'bite', 'big', 'fame',
    'shadow', 'mutation', 'night', 'energy',
    'golden-scale', 'mirage', 'grand-catch'
  ));

alter table public.daily_fortunes drop constraint if exists daily_fortunes_index_check;
alter table public.daily_fortunes add constraint daily_fortunes_index_check
  check (
    (kind in ('golden-scale', 'mirage', 'grand-catch') and index = 5)
    or (kind not in ('golden-scale', 'mirage', 'grand-catch') and index in (3, 5))
  );
