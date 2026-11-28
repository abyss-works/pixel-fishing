// 관리자 온보딩 퍼널 읽기 — 게스트→구글 전환율·전환 소요 시간 분포, 튜토리얼 4단계 완료·이탈,
// 초반 온보딩 6단계 도달률을 단일 CTE 쿼리로 집계한다.
// 이벤트 표(events)는 콜드 아카이브로 최근 7일만 hot 보관하므로, 이벤트 보조 신호에는 7일 창을 명시한다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { isCatchEventSql } from './telemetry.js';
import { TUTORIAL_IDS } from '../../src/game/content/tutorials.js';
import type { TutorialId } from '../../src/game/content/tutorials.js';

export const FUNNEL_EVENTS_WINDOW_DAYS = 7;

export type ConversionTimeBucketId =
  | 'under_10m'
  | '10m_to_1h'
  | '1h_to_24h'
  | '1d_to_7d'
  | 'over_7d';

export interface ConversionTimeBucket {
  bucket: ConversionTimeBucketId;
  count: number;
  pct: number;
}

export interface OnboardingConversion {
  totalUsers: number;
  guestUsers: number;
  googleLinkedUsers: number;
  conversionRate: number;
  medianMinutes: number | null;
  p90Minutes: number | null;
  buckets: ConversionTimeBucket[];
}

export interface OnboardingTutorialStage {
  id: TutorialId;
  completed: number;
  rate: number;
  dropOffFromPrev: number;
  stepRate: number | null;
}

export interface OnboardingTutorials {
  totalUsers: number;
  totalWithSave: number;
  stages: OnboardingTutorialStage[];
}

export type OnboardingStepId =
  | 'first_visit'
  | 'tutorial_complete'
  | 'first_catch'
  | 'first_sell'
  | 'first_harbor'
  | 'first_upgrade';

export type OnboardingStepBasis = 'lifetime' | 'hybrid_7d';

export interface OnboardingFunnelStep {
  id: OnboardingStepId;
  users: number;
  rate: number;
  stepRate: number | null;
  basis: OnboardingStepBasis;
}

export interface OnboardingFunnelReport {
  eventsWindowDays: number;
  conversion: OnboardingConversion;
  tutorials: OnboardingTutorials;
  steps: OnboardingFunnelStep[];
}

type FunnelRow = {
  total_users: number | string;
  guest_users: number | string;
  google_linked_users: number | string;
  median_sec: number | string | null;
  p90_sec: number | string | null;
  bucket_under_10m: number | string;
  bucket_10m_to_1h: number | string;
  bucket_1h_to_24h: number | string;
  bucket_1d_to_7d: number | string;
  bucket_over_7d: number | string;
  total_with_save: number | string;
  tut_village: number | string;
  tut_sea: number | string;
  tut_bounty_quests: number | string;
  tut_bounty_named: number | string;
  step_tutorial_complete: number | string;
  step_first_catch: number | string;
  step_first_sell: number | string;
  step_first_harbor: number | string;
  step_first_upgrade: number | string;
};

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const round1 = (n: number): number => Math.round(n * 10) / 10;

const ratio4 = (num: number, den: number): number => (den > 0 ? round4(num / den) : 0);
const pct1 = (num: number, den: number): number => (den > 0 ? round1((num / den) * 100) : 0);
const minutesOrNull = (sec: number | string | null): number | null =>
  sec === null || sec === undefined ? null : round1(Number(sec) / 60);

/** 온보딩 퍼널 집계(게스트→구글 전환, 튜토리얼 4단계, 초반 6단계 도달률)를 읽는다 */
export async function onboardingFunnel(db: Executor): Promise<OnboardingFunnelReport> {
  const { rows } = await db.execute<FunnelRow>(sql`
    with recent_events as (
      select user_id, type, payload
      from public.events
      where created_at >= now() - interval '7 days'
        and (${isCatchEventSql(sql`type`)} or type in ('sell', 'visit', 'upgradeRod', 'buyBoat'))
    ),
    google_links as (
      select user_id, min(created_at) as linked_at
      from auth.accounts
      where provider_id = 'google'
      group by user_id
    ),
    user_base as (
      select u.id,
             u.is_anonymous,
             u.created_at,
             g.linked_at,
             case
               when g.linked_at is not null
                 then greatest(0, extract(epoch from g.linked_at - u.created_at))::double precision
               else null
             end as elapsed_sec,
             c.user_id is not null as has_save,
             case
               when c.data is not null and jsonb_typeof(c.data -> 'tutorials') = 'array'
                 then c.data -> 'tutorials'
               else '[]'::jsonb
             end as tuts,
             case
               when c.data is not null and jsonb_typeof(c.data -> 'visited') = 'array'
                 then c.data -> 'visited'
               else '[]'::jsonb
             end as visited,
             c.data -> 'location' ->> 'kind' as loc_kind,
             c.data -> 'location' ->> 'id' as loc_id,
             coalesce(c.rod, 1) as rod,
             coalesce(c.boat, 0) as boat
      from auth.users u
      left join google_links g on g.user_id = u.id
      left join public.saves_current c on c.user_id = u.id
    ),
    catch_users as (
      select distinct user_id from public.records where count > 0
      union
      select distinct user_id from recent_events where ${isCatchEventSql(sql`type`)}
    ),
    sell_users as (
      select distinct user_id from public.achievement_counters where key = 'sell.gold' and value > 0
      union
      select distinct user_id from recent_events where type = 'sell'
    ),
    harbor_users as (
      select distinct b.id as user_id
      from user_base b
      where (b.loc_kind = 'base' and b.loc_id is not null and b.loc_id <> 'home')
         or exists (select 1 from jsonb_array_elements_text(b.visited) v(reg) where v.reg <> 'village')
      union
      select distinct user_id from public.bounty_accepts
      union
      select distinct user_id from recent_events
      where type = 'visit' and payload ->> 'region' is not null and payload ->> 'region' <> 'village'
    ),
    upgrade_users as (
      select id as user_id from user_base where rod > 1 or boat > 0
      union
      select distinct user_id from recent_events where type in ('upgradeRod', 'buyBoat')
    )
    select
      count(*)::int as total_users,
      count(*) filter (where b.is_anonymous and b.linked_at is null)::int as guest_users,
      count(*) filter (where b.linked_at is not null)::int as google_linked_users,
      percentile_cont(0.5) within group (order by b.elapsed_sec) filter (where b.elapsed_sec is not null) as median_sec,
      percentile_cont(0.9) within group (order by b.elapsed_sec) filter (where b.elapsed_sec is not null) as p90_sec,
      count(*) filter (where b.elapsed_sec is not null and b.elapsed_sec < 600)::int as bucket_under_10m,
      count(*) filter (where b.elapsed_sec >= 600 and b.elapsed_sec < 3600)::int as bucket_10m_to_1h,
      count(*) filter (where b.elapsed_sec >= 3600 and b.elapsed_sec < 86400)::int as bucket_1h_to_24h,
      count(*) filter (where b.elapsed_sec >= 86400 and b.elapsed_sec < 604800)::int as bucket_1d_to_7d,
      count(*) filter (where b.elapsed_sec >= 604800)::int as bucket_over_7d,
      count(*) filter (where b.has_save)::int as total_with_save,
      count(*) filter (where b.tuts @> '["village"]'::jsonb)::int as tut_village,
      count(*) filter (where b.tuts @> '["sea"]'::jsonb)::int as tut_sea,
      count(*) filter (where b.tuts @> '["bounty-quests"]'::jsonb)::int as tut_bounty_quests,
      count(*) filter (where b.tuts @> '["bounty-named"]'::jsonb)::int as tut_bounty_named,
      count(*) filter (where
        b.tuts @> '["village"]'::jsonb
        or b.tuts @> '["sea"]'::jsonb
        or b.tuts @> '["bounty-quests"]'::jsonb
        or b.tuts @> '["bounty-named"]'::jsonb
      )::int as step_tutorial_complete,
      count(*) filter (where cu.user_id is not null)::int as step_first_catch,
      count(*) filter (where su.user_id is not null)::int as step_first_sell,
      count(*) filter (where hu.user_id is not null)::int as step_first_harbor,
      count(*) filter (where uu.user_id is not null)::int as step_first_upgrade
    from user_base b
    left join catch_users cu on cu.user_id = b.id
    left join sell_users su on su.user_id = b.id
    left join harbor_users hu on hu.user_id = b.id
    left join upgrade_users uu on uu.user_id = b.id
  `);

  const r = rows[0];
  const totalUsers = Number(r.total_users);
  const guestUsers = Number(r.guest_users);
  const googleLinkedUsers = Number(r.google_linked_users);
  const totalWithSave = Number(r.total_with_save);

  const rawBuckets: readonly [ConversionTimeBucketId, number][] = [
    ['under_10m', Number(r.bucket_under_10m)],
    ['10m_to_1h', Number(r.bucket_10m_to_1h)],
    ['1h_to_24h', Number(r.bucket_1h_to_24h)],
    ['1d_to_7d', Number(r.bucket_1d_to_7d)],
    ['over_7d', Number(r.bucket_over_7d)],
  ];
  const buckets: ConversionTimeBucket[] = rawBuckets.map(([bucket, count]) => ({
    bucket,
    count,
    pct: pct1(count, googleLinkedUsers),
  }));

  const tutCounts: Record<TutorialId, number> = {
    village: Number(r.tut_village),
    sea: Number(r.tut_sea),
    'bounty-quests': Number(r.tut_bounty_quests),
    'bounty-named': Number(r.tut_bounty_named),
  };
  const stages: OnboardingTutorialStage[] = TUTORIAL_IDS.map((id, idx) => {
    const completed = tutCounts[id];
    const prev = idx > 0 ? tutCounts[TUTORIAL_IDS[idx - 1]] : null;
    return {
      id,
      completed,
      rate: ratio4(completed, totalUsers),
      dropOffFromPrev: prev === null ? 0 : Math.max(0, prev - completed),
      stepRate: prev === null || prev <= 0 ? null : round4(completed / prev),
    };
  });

  const rawSteps: readonly [OnboardingStepId, number, OnboardingStepBasis][] = [
    ['first_visit', totalUsers, 'lifetime'],
    ['tutorial_complete', Number(r.step_tutorial_complete), 'lifetime'],
    ['first_catch', Number(r.step_first_catch), 'lifetime'],
    ['first_sell', Number(r.step_first_sell), 'hybrid_7d'],
    ['first_harbor', Number(r.step_first_harbor), 'lifetime'],
    ['first_upgrade', Number(r.step_first_upgrade), 'lifetime'],
  ];
  const steps: OnboardingFunnelStep[] = rawSteps.map(([id, users, basis], idx) => {
    const prevUsers = idx > 0 ? rawSteps[idx - 1][1] : null;
    return {
      id,
      users,
      rate: ratio4(users, totalUsers),
      stepRate: prevUsers === null || prevUsers <= 0 ? null : round4(users / prevUsers),
      basis,
    };
  });

  return {
    eventsWindowDays: FUNNEL_EVENTS_WINDOW_DAYS,
    conversion: {
      totalUsers,
      guestUsers,
      googleLinkedUsers,
      conversionRate: ratio4(googleLinkedUsers, totalUsers),
      medianMinutes: minutesOrNull(r.median_sec),
      p90Minutes: minutesOrNull(r.p90_sec),
      buckets,
    },
    tutorials: {
      totalUsers,
      totalWithSave,
      stages,
    },
    steps,
  };
}
