-- DOWN: 0004 되돌리기 — coupons 테이블 제거. 정적 data/coupons.ts는 영향 없음(계속 동작).
drop table if exists public.coupons;
