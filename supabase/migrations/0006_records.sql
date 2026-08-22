-- 종×폼별 기록 (세이브 v8)
-- events 보관주기와 무관하게 살아남는 통계 정본 — v0.7 랭킹·최초발견·시즌의 근거.
-- 순수 가산 마이그레이션(구 코드에 무해) → ① 이것 먼저 실행 ② 코드 배포 순서가 안전하다
-- (v0.2.1 사고 재발 방지). 값은 서버가 리듀서 계산 결과(dex)를 절대값으로 upsert한다.
create table public.records (
  user_id uuid not null,
  fish_id text not null,
  form text not null,                    -- 'normal' | 'variant' | (미래 폼) — 자유 문자열
  count bigint not null,
  max_size real,                         -- null = 크기 미상(v7 이관) 기록뿐
  first_caught timestamptz,              -- null 허용 — 첫 조우일 기록이 없는 이관 도감이 있다
  updated_at timestamptz not null default now(),
  primary key (user_id, fish_id, form)
);
alter table public.records enable row level security;
-- 정책 없음 = service role 전용. 공개 조회(랭킹 API) 범위는 v0.7 설계에서 결정한다.

-- 종별 세계기록·최초발견 조회용. 개인기록은 PK 선두(user_id)로 커버된다.
create index records_leaderboard_idx on public.records (fish_id, form, max_size desc);
create index records_discovery_idx on public.records (fish_id, form, first_caught);
