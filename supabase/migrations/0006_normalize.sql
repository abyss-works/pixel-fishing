-- 정규화 — blob 한 덩어리에서 "접근 패턴이 다른 것"을 떼어낸다.
--
-- 판단 기준은 크기가 아니라 접근 패턴이다:
--   ① 다른 행과 비교·정렬·집계하나 → 컬럼/테이블 (gold·fame: 랭킹 대상)
--   ② 개별 항목을 따로 읽고 쓰나   → 테이블 (개체: 전시로 옮기기, 남이 구경)
--   ③ 통째로만 읽고 쓰나           → blob 유지 (coupons·locked)
--
-- 운영(v0.4.0)에는 0005·0006이 아직 적용된 적 없다. 스테이징에 구 0006(records)이
-- 적용돼 있으면 down으로 정리하고 이걸 적용한다.

-- ---------- 1. 스칼라를 컬럼으로 ----------
-- blob 안에 있으면 "명성 랭킹"을 뽑는 데 전 유저 blob 파싱이 필요하다.
alter table public.saves_current
  add column if not exists gold bigint not null default 0,
  add column if not exists fame bigint not null default 0,
  add column if not exists boat int  not null default 0,
  add column if not exists rod  int  not null default 1;

-- 랭킹 조회용 — v0.7 명성 랭킹이 이 인덱스를 탄다
create index if not exists saves_current_fame_idx on public.saves_current (fame desc);

-- ---------- 2. 개체 ----------
-- 가방과 전시대를 한 테이블에 둔다. slot이 둘을 가른다:
--   slot IS NULL = 가방 · slot = 숫자 = 전시대 그 칸
-- 전시로 옮기는 것이 UPDATE 한 줄이 되고(테이블 둘이면 DELETE+INSERT 원자성 문제),
-- "전시만 공개"가 정책 한 줄로 끝난다.
create table public.fish_instances (
  uid uuid primary key,
  user_id uuid not null,
  fish_id text not null,
  form text not null,
  size real,                          -- null = 구버전 이관 개체(크기 미상)
  caught_at timestamptz,
  spot text,
  judgment text,
  slot int,                           -- null = 가방
  locked boolean not null default false  -- 실수 판매 방지 (개체 단위)
);
alter table public.fish_instances enable row level security;

-- 본인 것은 전부 읽는다
create policy "fish_instances_select_own" on public.fish_instances
  for select using (auth.uid() = user_id);
-- 전시 중인 개체는 누구나 읽는다 — "남의 수족관 구경가기"의 전제.
-- 가방(slot is null)은 남에게 안 보인다.
create policy "fish_instances_select_exhibited" on public.fish_instances
  for select using (slot is not null);
-- 쓰기 정책 없음 = service role 전용

create index fish_instances_bag_idx on public.fish_instances (user_id, slot);

-- ---------- 3. 도감 = 종×폼 기록 ----------
-- 내 도감이자 크로스 유저 인덱스. 구 설계는 도감을 blob(dex)에도 두어 같은 값을 두 벌
-- 들고 있었다 — 여기 하나로 합친다.
create table public.records (
  user_id uuid not null,
  fish_id text not null,
  form text not null,
  count bigint not null,
  max_size real,                      -- null = 크기 미상 기록뿐
  first_caught timestamptz,           -- null 허용 — 이관 도감엔 첫 조우일이 없는 종이 있다
  updated_at timestamptz not null default now(),
  primary key (user_id, fish_id, form)
);
alter table public.records enable row level security;

-- 본인 도감 읽기 (클라이언트가 로드 시 읽는다)
create policy "records_select_own" on public.records
  for select using (auth.uid() = user_id);
-- 쓰기 정책 없음 = service role 전용

-- 종별 세계기록 · 최초발견자 조회용
create index records_leaderboard_idx on public.records (fish_id, form, max_size desc);
create index records_discovery_idx  on public.records (fish_id, form, first_caught);
