-- 관리자 읽기 계층 (대시보드 고도화) — **순수 가산**, 구 코드·구 데이터에 무해하므로
-- ① 이 마이그레이션 먼저 실행 → ② 코드 배포 순서가 안전하다 (v0.2.1 사고 재발 방지).
--
-- 설계 (draft/admin-dashboard-design.md 감사 결론 반영):
--   Vercel 함수 0 증가 — 대시보드는 클라(supabase-js)가 이 뷰/RPC를 직접 읽는다.
--   뷰는 postgres 소유(definer)라 기반 테이블 RLS(auth.users 등)를 통과하고, 대신
--   **본문마다 is_admin() 게이트**를 넣어 비관리자에게는 에러 없이 0행을 준다.
--   "?admin은 UI 토글일 뿐"이라는 기존 판정의 DB 쪽 보완이다.
--
-- 운영 적용 후 1회: admins에 개발자 uid INSERT (auth.users에서 email로 조회해서).
--   insert into public.admins (user_id)
--   select id from auth.users where email = '<개발자 이메일>'
--   on conflict do nothing;

-- ── 관리자 명부 — RLS on + 정책 없음 = 인증 사용자에게 비가시(service role/소유자만) ──
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- ── is_admin() — security definer: RLS로 막힌 admins 행도 본문 내 조회 가능. stable.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where a.user_id = auth.uid()
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ── 유저 명부 — 유일하게 auth.users를 건드리는 뷰(신원 ↔ 상태 조인). definer 우회 +
--    WHERE 게이트. 이메일 등 개인정보를 담으므로 관리자 외엔 아예 보이지 않아야 한다.
create or replace view public.v_admin_users as
select
  u.id                       as user_id,
  u.email,
  u.is_anonymous,
  u.created_at               as signed_up_at,
  u.last_sign_in_at,
  c.gold, c.fame, c.boat, c.rod,
  c.data -> 'location' ->> 'kind' as location_kind,
  c.data -> 'location' ->> 'id'   as location_id,
  c.data -> 'visited'             as visited,   -- jsonb 배열 — 지역 도달 퍼널의 근거(state.visited)
  c.restricted,
  c.version                  as save_version,
  c.updated_at               as last_action_at
from auth.users u
left join public.saves_current c on c.user_id = u.id
where public.is_admin();

-- ── 일별 활성 — boot(접속) 포함 전 액션 스트림 기준 DAU + 직전 7일 WAU. 90일 창.
create or replace view public.v_daily_active as
with today as (
  select (now() at time zone 'Asia/Seoul')::date as d
),
act as (
  select distinct user_id, (created_at at time zone 'Asia/Seoul')::date as day
  from public.events
),
daily as (select day, count(*)::int as dau from act group by day),
weekly as (
  select a.day, count(distinct a.user_id)::int as wau7
  from act a
  where exists (select 1 from act b
                where b.user_id = a.user_id and b.day between a.day - 6 and a.day)
  group by a.day
)
select t.d::date - g as day,
       coalesce(dd.dau, 0)   as dau,
       coalesce(ww.wau7, 0)  as wau7
from today t cross join generate_series(0, 89) g
left join daily dd   on dd.day = t.d::date - g
left join weekly ww  on ww.day = t.d::date - g
where public.is_admin()
order by day desc;

-- ── 리텐션 코호트 — 첫 행동일 코호트 × D1/D3/D7/D14/D30 재방문률(%)
create or replace view public.v_retention_cohorts as
with act as (
  select distinct user_id, (created_at at time zone 'Asia/Seoul')::date as day
  from public.events
),
first_day as (
  select user_id, min(day) as cohort from act group by user_id
)
select f.cohort,
       count(*)::int as users,
       round(100.0 * count(*) filter (where exists (
         select 1 from act a where a.user_id = f.user_id and a.day = f.cohort + 1))
         / count(*), 1)::numeric as d1,
       round(100.0 * count(*) filter (where exists (
         select 1 from act a where a.user_id = f.user_id and a.day = f.cohort + 3))
         / count(*), 1)::numeric as d3,
       round(100.0 * count(*) filter (where exists (
         select 1 from act a where a.user_id = f.user_id and a.day = f.cohort + 7))
         / count(*), 1)::numeric as d7,
       round(100.0 * count(*) filter (where exists (
         select 1 from act a where a.user_id = f.user_id and a.day = f.cohort + 14))
         / count(*), 1)::numeric as d14,
       round(100.0 * count(*) filter (where exists (
         select 1 from act a where a.user_id = f.user_id and a.day = f.cohort + 30))
         / count(*), 1)::numeric as d30
from first_day f
group by f.cohort
having public.is_admin()
order by cohort desc;

-- ── 경제 일계 — 골드 유입(sell·coupon) / 유출(upgradeRod·buyBoat·buyBait) 원장.
--    합계가 saves_current 잔고와 어긋나면 import(반입) 경로 의심 — v_cheat_flags와 나란히 본다.
create or replace view public.v_economy_daily as
select (created_at at time zone 'Asia/Seoul')::date                        as day,
       count(*) filter (where type = 'sell')::int                          as sells,
       coalesce(sum((payload->>'gold')::numeric) filter (where type = 'sell'), 0)     as sell_gold,
       coalesce(sum((payload->>'gold')::numeric) filter (where type = 'coupon'), 0)   as coupon_gold,
       coalesce(sum((payload->>'cost')::numeric) filter (where type = 'upgradeRod'), 0) as rod_cost,
       coalesce(sum((payload->>'cost')::numeric) filter (where type = 'buyBoat'), 0)    as boat_cost,
       coalesce(sum((payload->>'cost')::numeric) filter (where type = 'buyBait'), 0)    as bait_cost
from public.events
where type in ('sell', 'coupon', 'upgradeRod', 'buyBoat', 'buyBait')
  and public.is_admin()
group by day
order by day desc;

-- ── 캐치 품질 일계 — 수량과 PERFECT 비율(전체). 유저별 비교는 v_spam_flags.
create or replace view public.v_catch_quality as
select (created_at at time zone 'Asia/Seoul')::date        as day,
       count(*)::int                                       as catches,
       count(*) filter (where payload->>'judgment' = 'perfect')::int as perfect,
       count(*) filter (where payload->>'bait' is not null)::int     as with_bait,
       round(avg((payload->>'size')::numeric), 1)          as avg_size
from public.events
where type = 'catch'
  and public.is_admin()
group by day
order by day desc;

-- ── 연타·판정 플래그 — ops/queries-audit.sql ⑤⑥의 상시화. 최근 7일 기준 유저별 요약.
--    fast_gap_7d: 캐치 간격 <2초(물리적으로 불가한 연타) 건수.
--    perfect_pct 는 7일치, perfect_pct_global 은 30일 전체 평균 — 격차가 벌어지면 주목.
create or replace view public.v_spam_flags as
with c as (
  select id, user_id, created_at, payload,
         lag(created_at) over (partition by user_id order by id) as prev_at
  from public.events
  where type = 'catch'
),
per_user as (
  select user_id,
         count(*)::int                                                    as catches_7d,
         count(*) filter (where extract(epoch from created_at - prev_at) < 2)::int as fast_gap_7d,
         round(100.0 * count(*) filter (where payload->>'judgment' = 'perfect')
               / greatest(count(*), 1), 1)::numeric                       as perfect_pct
  from c
  where created_at > now() - interval '7 day'
  group by user_id
),
glob as (
  select round(100.0 * count(*) filter (where payload->>'judgment' = 'perfect')
               / greatest(count(*), 1), 1)::numeric                       as perfect_pct_global
  from c
  where created_at > now() - interval '30 day'
)
select p.*, g.perfect_pct_global
from per_user p cross join glob g
where public.is_admin();

-- ── import 반입 로그 — 감사 ⑦의 상시화. 무검증 수입(의도된 구멍)의 흔적 원장.
create or replace view public.v_import_log as
select e.id, e.user_id, e.created_at,
       (e.payload->>'gold')::numeric as gold,
       (e.payload->>'fame')::numeric as fame
from public.events e
where e.type = 'import'
  and public.is_admin();

-- ── 도감↔이벤트 차액 — 감사 ④의 상시화. 근거 없는 도감(catch 이벤트보다 많은 카운트)
--    상위부터. v0.5.0 이전 플레이분은 이벤트 제도 자체가 없어 정상적으로 잡힌다(해석 주의).
create or replace view public.v_dex_mismatch as
with evc as (
  select user_id, payload->>'fishId' as fish_id, payload->>'form' as form,
         count(*)::int as n
  from public.events
  where type = 'catch'
  group by 1, 2, 3
)
select r.user_id, r.fish_id, r.form,
       r.count                            as dex_count,
       coalesce(evc.n, 0)                 as event_count,
       r.count - coalesce(evc.n, 0)       as missing_events
from public.records r
left join evc on evc.user_id = r.user_id
             and evc.fish_id = r.fish_id
             and evc.form = r.form
where r.count > coalesce(evc.n, 0)
  and public.is_admin();

-- ── 최근 이벤트 피드 — 개요 탭용 최신 80행.
create or replace view public.v_events_recent as
select id, user_id, type, payload, created_at
from public.events
where public.is_admin()
order by id desc
limit 80;

-- ── 유저별 이벤트 덤프(RPC) — 감사 ③의 파라미터화. 뷰로 하면 남의 전체 events를
--     한 번에 끌어와야 하지만, RPC면 드릴다운할 유저의 것만 제한 행수로 읽는다.
create or replace function public.fn_user_events(p_uid uuid, p_limit int default 500)
returns table (id bigint, user_id uuid, type text, payload jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.user_id, e.type, e.payload, e.created_at
  from public.events e
  where e.user_id = p_uid
    and public.is_admin()
  order by e.id desc
  limit least(greatest(coalesce(p_limit, 500), 1), 2000);
$$;
revoke all on function public.fn_user_events(uuid, int) from public, anon;
grant execute on function public.fn_user_events(uuid, int) to authenticated, service_role;

-- ── 권한 정리 — Supabase 기본권한(anon select) 회수. authenticated만 허용한다.
--    is_admin() 0행 게이트가 실제 방어선이다(뷰 소유권 우회는 postgres만 가능).
revoke all on public.v_admin_users      from anon;
revoke all on public.v_daily_active     from anon;
revoke all on public.v_retention_cohorts from anon;
revoke all on public.v_economy_daily    from anon;
revoke all on public.v_catch_quality    from anon;
revoke all on public.v_spam_flags       from anon;
revoke all on public.v_import_log       from anon;
revoke all on public.v_dex_mismatch     from anon;
revoke all on public.v_events_recent    from anon;
grant select on public.v_admin_users      to authenticated;
grant select on public.v_daily_active     to authenticated;
grant select on public.v_retention_cohorts to authenticated;
grant select on public.v_economy_daily    to authenticated;
grant select on public.v_catch_quality    to authenticated;
grant select on public.v_spam_flags       to authenticated;
grant select on public.v_import_log       to authenticated;
grant select on public.v_dex_mismatch     to authenticated;
grant select on public.v_events_recent    to authenticated;
