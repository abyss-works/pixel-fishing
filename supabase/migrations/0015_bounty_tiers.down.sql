-- 0015 롤백용 (기본 절차로 돌리지 않는다 — roadmap 0.0 8번).
-- 주의: 같은 해역의 2단 라이선스를 둘 다 가진 유저가 있으면 PK 복원이 실패한다.
-- 그 경우 네임드 행을 먼저 지우고 돌린다.
alter table public.bounty_licenses drop constraint bounty_licenses_pkey;
alter table public.bounty_licenses add primary key (user_id, zone);
alter table public.bounty_licenses drop column tier;
