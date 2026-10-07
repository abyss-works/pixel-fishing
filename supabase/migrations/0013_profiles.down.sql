-- 0013 롤백용 (기본 절차로 돌리지 않는다 — roadmap 0.0 8번).
drop policy if exists "profiles_select_own" on public.profiles;
drop index if exists public.profiles_nickname_lower_idx;
drop table if exists public.profiles;
