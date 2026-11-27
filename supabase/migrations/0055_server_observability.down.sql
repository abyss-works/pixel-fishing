-- 0055 되돌림 — WebSocket 일별 지표 표와 HTTP 지표 확장 열을 역순으로 제거한다.
drop table if exists public.ws_metrics_daily;

alter table public.http_metrics_daily
  drop column if exists rl_other,
  drop column if exists rl_letter_gap,
  drop column if exists rl_catch_too_soon,
  drop column if exists lat_sum_ms,
  drop column if exists lat_gt_2500,
  drop column if exists lat_le_2500,
  drop column if exists lat_le_1000,
  drop column if exists lat_le_500,
  drop column if exists lat_le_250,
  drop column if exists lat_le_100,
  drop column if exists lat_le_50,
  drop column if exists status_4xx,
  drop column if exists status_409;
