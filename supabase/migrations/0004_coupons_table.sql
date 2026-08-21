-- 동적 쿠폰 테이블 — 코드 배포 없이 쿠폰을 추가하기 위함.
-- 기존 data/coupons.ts(정적, '출항준비' 등)는 그대로 둔다 — 이미 세이브에 기록된 코드는
-- 영원히 인식돼야 하므로(가산 원칙) 코드에서 빼지 않는다. 이 테이블은 "추가로 뿌리는" 코드용.
--
-- RLS: 읽기는 전체 공개(anon) — 정적 COUPONS도 클라이언트 번들에 그대로 노출되던 것과
-- 동일한 노출 수준이라 후퇴 아님. 쓰기는 정책 없음 = anon/authenticated 전부 불가,
-- service role(서버) 또는 Supabase 대시보드(SQL Editor/Table Editor)에서만 추가 가능.

create table if not exists public.coupons (
  code text primary key,
  gold int not null check (gold >= 0),
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.coupons enable row level security;

create policy "coupons public read"
  on public.coupons
  for select
  using (true);

-- active=false는 "신규 redemption 차단"용이지 과거 기록 무효화용이 아니다.
-- 서버 검증(validate.ts)은 active 여부와 무관하게 존재 여부만 확인 — 이미 쓴 코드가
-- 나중에 비활성화돼도 그 유저의 세이브가 깨지지 않는다.
