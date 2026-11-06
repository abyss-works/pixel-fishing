-- 길드 이름 바꾸기 — 마지막으로 이름을 바꾼 시각(하루 한 번 제한의 기준)과 항해일지의 이름 바꾸기 기록.
-- 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
alter table public.guilds add column renamed_at timestamptz;

-- 항해일지 — 이름 바꾸기(rename: detail 새 이름)
alter table public.guild_logs drop constraint guild_logs_kind_check;
alter table public.guild_logs add constraint guild_logs_kind_check
  check (kind in ('join', 'leave', 'kick', 'legendary', 'named', 'donate', 'bonus-up', 'rename'));
