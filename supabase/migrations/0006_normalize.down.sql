-- 0006 롤백.
-- ⚠️ fish_instances·records를 DROP하면 개체와 도감이 사라진다.
-- 롤백 전에 반드시 두 테이블을 saves_current.data(blob)로 되접거나 export할 것.
-- 스칼라 컬럼은 blob에도 사본이 남아 있으므로 컬럼만 지우는 것은 무손이다.
drop table if exists public.fish_instances;
drop table if exists public.records;

drop index if exists public.saves_current_fame_idx;
alter table public.saves_current
  drop column if exists gold,
  drop column if exists fame,
  drop column if exists boat,
  drop column if exists rod;
