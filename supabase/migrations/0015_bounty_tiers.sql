-- 라이선스 2단 (spec/bounty-hunting.md 2절) — 기본(난이도 3종) + 네임드(지명 수배).
-- 기존 행이 있으면 전부 기본으로 둔다.
-- 순수 가산 — 파일 먼저 실행 → 코드 배포가 안전하다.
alter table public.bounty_licenses add column tier text not null default 'basic';
alter table public.bounty_licenses drop constraint bounty_licenses_pkey;
alter table public.bounty_licenses add primary key (user_id, zone, tier);
