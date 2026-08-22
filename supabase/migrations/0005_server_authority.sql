-- 서버 권위 전환 (v0.5.0)
-- 상태는 서버(/api/action)가 계산한다. 순수 가산 마이그레이션 — 구 코드에 무해하므로
-- ① 이 마이그레이션 먼저 실행 → ② 코드 배포 순서가 안전하다 (v0.2.1 사고 재발 방지).
-- 기존 saves는 삭제하지 않는다 — 스냅샷 아카이브로 강등 (서버가 50액션마다 append).

-- 유저당 현재 상태 1행 — 서버만 쓴다. version = 낙관 락 (멀티탭 경합 직렬화).
create table public.saves_current (
  user_id uuid primary key,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.saves_current enable row level security;
-- 본인 행 읽기만 — 쓰기 정책 없음(service role 전용)
create policy "saves_current_select_own" on public.saves_current
  for select using (auth.uid() = user_id);

-- 액션 이벤트 스트림 — append-only 정본 (v0.6 랭킹/업적/감사의 근거).
-- catch 외 액션(sell/upgrade/buy/coupon/import)도 남긴다 — server-authority-design의
-- catch_events 전용 스키마를 일반화 개정 (payload jsonb).
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;
-- 정책 없음 — 클라이언트는 읽기도 불가 (service role/관리자 전용)
create index events_user_idx on public.events (user_id, created_at desc);
