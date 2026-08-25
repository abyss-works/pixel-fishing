-- 유저 제재 — 2026-08-24 import 악용 사고 대응 (incidents/2026-08-24-import-abuse.md)
-- deleted 행이 아니라 **제재 플래그**다: 자산·도감·기록은 그대로 두고 활동(액션)만 막는다.
-- 서버(api/action.ts)가 모든 액션에서 이 값을 검사해 403 restricted로 거부한다.
-- 순수 가산 마이그레이션 — 구 코드에 무해(v0.2.1 사고 재발 방지: 먼저 적용 → 코드 배포).
alter table public.saves_current
  add column if not exists restricted boolean not null default false;

-- 적용/해제는 Supabase 대시보드 SQL 에디터(service role)에서:
--   제재: update public.saves_current set restricted = true  where user_id = '<uid>';
--   해제: update public.saves_current set restricted = false where user_id = '<uid>';
-- saves_current는 유저당 1행(PK user_id)이라 컬럼 하나가 곧 계정 상태다.
-- 첫 액션 전 유저는 행 자체가 없어 제재 대상이 될 수 없다 — 변조는 액션을 통해서만 일어나므로 문제없다.
