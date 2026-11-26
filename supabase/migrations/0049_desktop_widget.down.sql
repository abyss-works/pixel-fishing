-- 0049 되돌림 — 위젯 토큰·인증 코드 표와 saves_current.last_spot 열을 제거한다.
drop index if exists public.widget_tokens_expires_idx;
drop index if exists public.widget_tokens_user_idx;
drop table if exists public.widget_tokens;

drop index if exists public.widget_auth_codes_expires_idx;
drop table if exists public.widget_auth_codes;

alter table public.saves_current
  drop column if exists last_spot;
