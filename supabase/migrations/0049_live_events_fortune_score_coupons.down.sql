-- 0049 되돌림 — 라이브 이벤트 표·쿠폰 사용 이력 표와 추가 열을 제거한다.
drop index if exists public.event_draws_event_user_idx;
drop table if exists public.event_draws;

drop index if exists public.event_championship_scores_rank_idx;
drop table if exists public.event_championship_scores;

drop table if exists public.event_trio_progress;

drop index if exists public.live_events_active_window_idx;
drop table if exists public.live_events;

drop index if exists public.coupon_redemptions_user_idx;
drop index if exists public.coupon_redemptions_code_user_idx;
drop table if exists public.coupon_redemptions;

alter table public.coupons
  drop column if exists per_account_limit,
  drop column if exists max_redemptions,
  drop column if exists ends_at,
  drop column if exists starts_at,
  drop column if exists items;

alter table public.daily_fortunes
  drop column if exists score;
