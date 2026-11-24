// 관리자 읽기. 관리자 대시보드가 보는 조회이며 읽기만 한다.
// 관리자 뷰(v_admin_users·v_economy_daily·v_spam_flags·v_events_recent·v_admin_letters·v_bounty_funnel_daily)와
// 사용자 이벤트 함수(fn_user_events)의 본문을 따른다. 뷰 본문의 관리자 판정(is_admin)은 호출하는 쪽이 isAdmin으로 먼저 한다.
// 행은 Postgres JSON 직렬화 그대로다. 시각은 '2030-01-01T00:00:00+00:00' 형식의 문자열, 날짜는 'yyyy-mm-dd', 수는 수다.
// 뷰가 순서를 정하지 않는 조회에는 같은 요청이 같은 순서를 받도록 정렬을 둔다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { ACHIEVEMENTS } from '../../src/game/content/achievements.js';
import { ARTIFACTS, artifactById, artifactHasLevel } from '../../src/game/content/artifacts.js';
import { bountyById } from '../../src/game/content/bounties.js';
import { ENERGY_ITEM_IDS, RECIPES, recipeById } from '../../src/game/content/cooking.js';
import { FISH, fishById } from '../../src/game/content/fish.js';
import { NAMED } from '../../src/game/content/named.js';
import { spotById } from '../../src/game/content/spots.js';
import type { SpotId } from '../../src/game/content/spots.js';
import { HATS, hatById } from '../../src/game/content/wardrobe.js';
import { zoneById } from '../../src/game/content/zones.js';
import type { ZoneId } from '../../src/game/content/zones.js';
import type { LiveOnline } from '../_server/live.js';
import { uuidArray } from './json.js';

const FISH_IDS = new Set(FISH.map(f => f.id));
const NAMED_IDS = new Set(NAMED.map(n => n.id));
const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(a => a.id));

/** 사용자가 관리자 명부(admins)에 있는가. is_admin()과 같은 명부를 세션의 uid로 직접 조회한다 */
export async function isAdmin(db: Executor, uid: string): Promise<boolean> {
  const { rows } = await db.execute<{ admin: boolean }>(
    sql`select exists (select 1 from public.admins where user_id = ${uid}::uuid) as admin`);
  return rows[0].admin;
}

/** 사용자에게 비밀번호 로그인 수단(자격 계정)이 남아 있는가. 구글 연결을 마친 계정은 없다 */
export async function hasPasswordAccount(db: Executor, uid: string): Promise<boolean> {
  const { rows } = await db.execute<{ found: boolean }>(
    sql`select exists (select 1 from auth.accounts where user_id = ${uid}::uuid and provider_id = 'credential') as found`);
  return rows[0].found;
}

/** 조회문의 행을 order 순서의 JSON 배열로 읽는다. 행이 없으면 빈 배열이다 */
async function jsonRows(db: Executor, query: SQL, order: SQL): Promise<unknown[]> {
  const { rows } = await db.execute<{ rows: unknown[] }>(
    sql`select coalesce(json_agg(t order by ${order}), '[]'::json) as rows from (${query}) t`);
  return rows[0].rows;
}

/** day 열이 KST 오늘부터 days일 안인 행만 남긴다 */
function lastDays(db: Executor, days: number, body: SQL): Promise<unknown[]> {
  return jsonRows(db, sql`select * from (${body}) v
    where v.day >= (now() at time zone 'Asia/Seoul')::date - ${days - 1}::int`, sql`t.day desc`);
}

/**
 * 사용자 명부. 인증 계정과 닉네임, 현재 저장 상태를 잇고(마지막 로그인은 세션의 마지막 사용 시각이다), 최근 행동순으로 정렬하며 행동이 없는 계정은 뒤에 둔다.
 * 마지막 세션(last_session_at)은 접속 세션이 가장 늦게 끝난 시각, 누적 세션(total_session_sec)은 접속 세션 길이의 합(초)이다.
 */
export function users(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`select u.id as user_id, case when u.is_anonymous then null else u.email end as email, u.is_anonymous,
      p.nickname,
      u.created_at as signed_up_at,
      (select max(s.updated_at) from auth.sessions s where s.user_id = u.id) as last_sign_in_at,
      c.gold, c.fame, c.boat, c.rod,
      c.data -> 'location' ->> 'kind' as location_kind,
      c.data -> 'location' ->> 'id' as location_id,
      c.data -> 'visited' as visited,
      c.restricted, c.version as save_version, c.updated_at as last_action_at,
      ps.last_session_at, coalesce(ps.total_session_sec, 0) as total_session_sec
    from auth.users u
    left join (select user_id, max(ended_at) as last_session_at, sum(duration_sec)::bigint as total_session_sec
      from public.play_sessions group by user_id) ps on ps.user_id = u.id
    left join public.profiles p on p.user_id = u.id
    left join public.saves_current c on c.user_id = u.id`, sql`t.last_action_at desc nulls last, t.user_id`);
}

/** 계정 식별 정보. 닉네임과 이메일이고, 게스트의 임시 이메일은 null이다. 인증 계정이 없는 uid는 결과에 없다 */
export async function identities(db: Executor, uids: readonly string[]): Promise<Map<string, { nickname: string | null; email: string | null }>> {
  const { rows } = await db.execute<{ user_id: string; nickname: string | null; email: string | null }>(sql`select u.id::text as user_id,
      p.nickname, case when u.is_anonymous then null else u.email end as email
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    where u.id = any(${uuidArray(uids)})`);
  return new Map(rows.map(({ user_id, ...identity }) => [user_id, identity]));
}

/** 경제 일계. 골드 유입(sell·coupon·claimMail·deliverBounty·claimAchievement·claimAllAchievements)과 유출(upgradeRod·buyBoat·buyHat) 원장 */
export function economy(db: Executor, days: number): Promise<unknown[]> {
  return lastDays(db, days, sql`select (created_at at time zone 'Asia/Seoul')::date as day,
           count(*) filter (where type = 'sell')::int as sells,
           coalesce(sum((payload->>'gold')::numeric) filter (where type = 'sell'), 0) as sell_gold,
           coalesce(sum((payload->>'gold')::numeric) filter (where type = 'coupon'), 0) as coupon_gold,
           coalesce(sum((payload->>'gold')::numeric) filter (where type = 'claimMail'), 0) as mail_gold,
           coalesce(sum((payload->>'reward')::numeric) filter (where type = 'deliverBounty'), 0) as bounty_gold,
           coalesce(sum((payload->>'gold')::numeric) filter (where type in ('claimAchievement', 'claimAllAchievements')), 0) as achievement_gold,
           coalesce(sum((payload->>'cost')::numeric) filter (where type = 'upgradeRod'), 0) as rod_cost,
           coalesce(sum((payload->>'cost')::numeric) filter (where type = 'buyBoat'), 0) as boat_cost,
           coalesce(sum((payload->>'cost')::numeric) filter (where type = 'buyHat'), 0) as hat_cost
    from public.events
    where type in ('sell', 'coupon', 'claimMail', 'deliverBounty', 'claimAchievement', 'claimAllAchievements', 'upgradeRod', 'buyBoat', 'buyHat')
    group by day`);
}

/** 바운티 퍼널 일계. 네임드 수주, 도전권, 결투 승패, 토벌 보상, 일반 수주와 납품 */
export function bountyFunnel(db: Executor, days: number): Promise<unknown[]> {
  return lastDays(db, days, sql`select (created_at at time zone 'Asia/Seoul')::date as day,
           count(*) filter (where type = 'acceptQuest' and payload->>'questId' like '%-named-%')::int as named_accepts,
           count(*) filter (where type = 'ticket')::int as tickets,
           count(*) filter (where type = 'resolveChallenge' and payload->>'success' = 'true')::int as duels_won,
           count(*) filter (where type = 'resolveChallenge' and payload->>'success' = 'false')::int as duels_lost,
           count(*) filter (where type = 'deliverBounty' and payload->>'questId' like '%-named-%')::int as named_rewards,
           count(*) filter (where type = 'acceptQuest' and payload->>'questId' not like '%-named-%')::int as general_accepts,
           count(*) filter (where type = 'deliverBounty' and payload->>'questId' not like '%-named-%')::int as general_rewards
    from public.events
    where type in ('acceptQuest', 'ticket', 'resolveChallenge', 'deliverBounty')
    group by day`);
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

const asNum = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

/** 대상 플레이어의 게임 상태 스냅샷(도감·네임드 토벌·유물·모자·업적/카운터·기운/요리/슬롯·가방/전시·주요 진행 현황·활성 세션)을 읽는다 */
export async function userState(db: Executor, uid: string): Promise<unknown> {
  const { rows } = await db.execute<{
    has_save: boolean;
    data: unknown;
    records: { fish_id: string; form: string; count: number }[];
    cleared_named: string[];
    instances: { bag: number; exhibit: number } | null;
    recent_bag: { uid: string; fish_id: string; form: string; size: number | null; caught_at: string | null; spot: string | null; locked: boolean }[];
    bounty_progress: { quest_id: string; zone: string; progress: number; started_at: string }[];
    bounty_tickets: { quest_id: string; issued_at: string }[];
    active_sessions: number;
    counters: Record<string, number> | null;
  }>(sql`select
      exists(select 1 from public.saves_current where user_id = ${uid}::uuid) as has_save,
      (select data from public.saves_current where user_id = ${uid}::uuid) as data,
      (select coalesce(json_agg(json_build_object('fish_id', fish_id, 'form', form, 'count', count)), '[]'::json)
       from public.records where user_id = ${uid}::uuid and count > 0) as records,
      (select coalesce(json_agg(quest_id), '[]'::json)
       from public.bounty_clears where user_id = ${uid}::uuid and kind = 'named') as cleared_named,
      (select json_build_object(
         'bag', count(*) filter (where slot is null)::int,
         'exhibit', count(*) filter (where slot is not null)::int
       ) from public.fish_instances where user_id = ${uid}::uuid) as instances,
      (select coalesce(json_agg(json_build_object(
         'uid', rb.uid, 'fish_id', rb.fish_id, 'form', rb.form, 'size', rb.size,
         'caught_at', rb.caught_at, 'spot', rb.spot, 'locked', rb.locked
       )), '[]'::json) from (
         select uid, fish_id, form, size, caught_at, spot, locked
         from public.fish_instances
         where user_id = ${uid}::uuid and slot is null
         order by caught_at desc nulls last, uid desc
         limit 30
       ) rb) as recent_bag,
      (select coalesce(json_agg(json_build_object(
         'quest_id', quest_id, 'zone', zone, 'progress', progress, 'started_at', started_at
       ) order by started_at desc), '[]'::json)
       from public.bounty_progress where user_id = ${uid}::uuid) as bounty_progress,
      (select coalesce(json_agg(json_build_object(
         'quest_id', quest_id, 'issued_at', issued_at
       ) order by issued_at desc), '[]'::json)
       from public.bounty_tickets where user_id = ${uid}::uuid) as bounty_tickets,
      (select count(*)::int from auth.sessions where user_id = ${uid}::uuid and expires_at > now()) as active_sessions,
      (select coalesce(json_object_agg(key, value), '{}'::json)
       from public.achievement_counters where user_id = ${uid}::uuid) as counters`);

  const row = rows[0];
  const data = asRecord(row.data);
  const records = Array.isArray(row.records) ? row.records : [];
  const clearedNamed = Array.isArray(row.cleared_named) ? row.cleared_named : [];
  const rawCounters = asRecord(row.counters);
  const counters: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawCounters)) {
    const n = Number(v);
    if (Number.isFinite(n)) counters[k] = n;
  }

  let normal = 0;
  let variant = 0;
  let named = 0;
  for (const r of records) {
    if (r.form === 'normal' && FISH_IDS.has(r.fish_id)) normal++;
    else if (r.form === 'variant' && FISH_IDS.has(r.fish_id)) variant++;
    else if (r.form === 'normal' && NAMED_IDS.has(r.fish_id)) named++;
  }

  const rawArtifacts = Array.isArray(data.artifacts) ? data.artifacts.filter((x): x is string => typeof x === 'string') : [];
  const rawLevels = asRecord(data.artifactLevels);
  const artifacts = [...new Set(rawArtifacts)].map(id => {
    const def = artifactById(id);
    const rawLevel = asNum(rawLevels[id]);
    const level = def && !artifactHasLevel(def) ? null : (rawLevel >= 1 ? Math.floor(rawLevel) : 1);
    return { id, name: def?.name ?? id, grade: def?.grade ?? null, level };
  });

  const rawHats = Array.isArray(data.hats) ? data.hats.filter((x): x is string => typeof x === 'string') : [];
  const ownedHatItems = [...new Set(rawHats)].flatMap(id => {
    const hat = hatById(id);
    return hat ? [{ id: hat.id, name: hat.name, source: hat.source }] : [];
  });
  const rawLook = asRecord(data.look);
  const equippedHatDef = typeof rawLook.hat === 'string' ? hatById(rawLook.hat) : undefined;
  const equippedHat = equippedHatDef ? { id: equippedHatDef.id, name: equippedHatDef.name } : null;

  const rawAchievements = asRecord(data.achievements);
  let claimed = 0;
  let claimable = 0;
  for (const [id, status] of Object.entries(rawAchievements)) {
    if (!ACHIEVEMENT_IDS.has(id)) continue;
    if (status === 'claimed') claimed++;
    else if (status === 'claimable') claimable++;
  }

  const items = asRecord(data.items);
  const energy = {
    common: asNum(items[ENERGY_ITEM_IDS.common]),
    rare: asNum(items[ENERGY_ITEM_IDS.rare]),
    epic: asNum(items[ENERGY_ITEM_IDS.epic]),
    legendary: asNum(items[ENERGY_ITEM_IDS.legendary]),
  };
  const cooked = RECIPES.flatMap(r => {
    const count = asNum(items[r.id]);
    return count > 0 ? [{ id: r.id, name: r.name, kind: r.kind, count }] : [];
  });
  const rawCooking = asRecord(data.cooking);
  const inProgress = typeof rawCooking.recipe === 'string'
    ? {
        recipe: rawCooking.recipe,
        name: recipeById(rawCooking.recipe)?.name ?? rawCooking.recipe,
        count: asNum(rawCooking.count),
        startedAt: typeof rawCooking.startedAt === 'string' ? rawCooking.startedAt : '',
      }
    : null;
  const rawSlots = asRecord(data.slots);
  const parseSlot = (slot: unknown): { id: string; name: string; endsAt: string } | null => {
    const s = asRecord(slot);
    if (typeof s.id !== 'string' || typeof s.endsAt !== 'string') return null;
    return { id: s.id, name: recipeById(s.id)?.name ?? s.id, endsAt: s.endsAt };
  };
  const bait2 = parseSlot(rawSlots.bait2);

  const recentBag = (Array.isArray(row.recent_bag) ? row.recent_bag : []).map(item => {
    const fish = fishById(item.fish_id);
    const spot = item.spot ? spotById(item.spot as SpotId)?.name ?? item.spot : null;
    return {
      uid: item.uid,
      fishId: item.fish_id,
      name: fish?.name ?? item.fish_id,
      form: item.form,
      grade: fish?.rarity ?? null,
      size: typeof item.size === 'number' ? item.size : null,
      caughtAt: item.caught_at ?? null,
      spot,
      locked: Boolean(item.locked),
    };
  });

  const visited = Array.isArray(data.visited) ? data.visited.filter((x): x is string => typeof x === 'string') : [];
  const coupons = Array.isArray(data.coupons) ? data.coupons.filter((x): x is string => typeof x === 'string') : [];
  const bountyProgress = (Array.isArray(row.bounty_progress) ? row.bounty_progress : []).map(p => ({
    questId: p.quest_id,
    zone: zoneById(p.zone as ZoneId)?.name ?? p.zone,
    progress: Number(p.progress),
    target: bountyById(p.quest_id)?.count ?? null,
    startedAt: p.started_at,
  }));
  const bountyTickets = (Array.isArray(row.bounty_tickets) ? row.bounty_tickets : []).map(t => ({
    questId: t.quest_id,
    issuedAt: t.issued_at,
  }));

  return {
    hasSave: Boolean(row.has_save),
    dex: {
      normal,
      normalTotal: FISH.length,
      variant,
      variantTotal: FISH.length,
      named,
      namedTotal: NAMED.length,
    },
    bounty: {
      namedClears: clearedNamed.length,
      namedDistinctClears: new Set(clearedNamed).size,
      namedTotal: NAMED.length,
    },
    artifacts: {
      owned: artifacts,
      total: ARTIFACTS.length,
    },
    hats: {
      owned: ownedHatItems.length,
      total: HATS.length,
      items: ownedHatItems,
      equipped: equippedHat,
    },
    achievements: {
      claimed,
      claimable,
      total: ACHIEVEMENTS.length,
      counters,
    },
    cooking: {
      energy,
      cooked,
      inProgress,
      slots: {
        lunch: parseSlot(rawSlots.lunch),
        bait: parseSlot(rawSlots.bait),
        ...(bait2 ? { bait2 } : {}),
      },
    },
    instances: {
      bag: Number(row.instances?.bag ?? 0),
      exhibit: Number(row.instances?.exhibit ?? 0),
      recentBag,
    },
    progression: {
      visited,
      coupons,
      bountyProgress,
      bountyTickets,
      activeSessions: Number(row.active_sessions ?? 0),
    },
  };
}

/** 연타·판정 플래그. 최근 7일 사용자별 캐치 수, 간격 2초 미만 캐치 수, PERFECT 비율과 30일 전체 평균 */
export function spamFlags(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`with c as (
      select id, user_id, created_at, payload,
             lag(created_at) over (partition by user_id order by id) as prev_at
      from public.events
      where type = 'catch'
    ),
    per_user as (
      select user_id,
             count(*)::int as catches_7d,
             count(*) filter (where extract(epoch from created_at - prev_at) < 2)::int as fast_gap_7d,
             round(100.0 * count(*) filter (where payload->>'judgment' = 'perfect')
                   / greatest(count(*), 1), 1)::numeric as perfect_pct
      from c
      where created_at > now() - interval '7 day'
      group by user_id
    ),
    glob as (
      select round(100.0 * count(*) filter (where payload->>'judgment' = 'perfect')
                   / greatest(count(*), 1), 1)::numeric as perfect_pct_global
      from c
      where created_at > now() - interval '30 day'
    )
    select p.user_id, p.catches_7d, p.fast_gap_7d, p.perfect_pct, g.perfect_pct_global
    from per_user p cross join glob g`, sql`t.user_id`);
}

/** 최근 이벤트 피드. 최신 80행, id 내림차순 */
export function recentEvents(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`select id, user_id, type, payload, created_at
    from public.events
    order by id desc
    limit 80`, sql`t.id desc`);
}

/** 사용자 한 명의 최신 이벤트 limit건을 id 오름차순으로 읽는다. 건수는 1~2000으로 맞추고 없으면 500이다 */
export function userEvents(db: Executor, userId: string, limit: number | null): Promise<unknown[]> {
  return jsonRows(db, sql`select e.id, e.user_id, e.type, e.payload, e.created_at
    from public.events e
    where e.user_id = ${userId}::uuid
    order by e.id desc
    limit least(greatest(coalesce(${limit}::int, 500), 1), 2000)`, sql`t.id`);
}

/** 편지 목록. 영구 보관 표에서 최신순이고, 관리자가 처리한 편지는 처리 시각(handled_at)을 가진다 */
export function letters(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`select l.id, l.user_id, l.text, l.created_at, l.handled_at
    from public.letters l`, sql`t.created_at desc, t.id desc`);
}

/** 변경 기록. 최신 버전부터, 버전 안에서는 순번 순서다. 철회된 항목도 withdrawnAt을 달아 함께 준다 */
export function changelog(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`select c.id, c.version, c.date, c.seq, c.tier, c.tag, c.text, c.withdrawn_at as "withdrawnAt"
    from public.changelog_entries c`, sql`string_to_array(t.version, '.')::int[] desc, t.seq, t.id`);
}

/** 채팅 신고 목록. 최근 신고 200건, 최신순. lines는 신고한 메시지와 앞뒤 대화의 복사본이다 */
export function chatReports(db: Executor): Promise<unknown[]> {
  return jsonRows(db, sql`select r.id, r.user_id, r.message_id, r.target_id, r.lines, r.created_at
    from public.chat_reports r
    order by r.created_at desc, r.id desc
    limit 200`, sql`t.created_at desc, t.id desc`);
}

/** 일별 집계 행을 from부터 to까지(KST 날짜, 양끝 포함) 날짜 오름차순으로 준다. 집계되지 않은 날은 행이 없다 */
export function dailyStats(db: Executor, from: string, to: string): Promise<unknown[]> {
  return jsonRows(db, sql`select day, dau, new_users as "newUsers", new_accounts as "newAccounts",
      sessions, session_minutes as "sessionMinutes", median_session_minutes as "medianSessionMinutes",
      catches, gold_in as "goldIn", gold_out as "goldOut", actions
    from public.daily_stats
    where day between ${from}::date and ${to}::date`, sql`t.day`);
}

/**
 * 가입일 리텐션. 최근 60일(오늘 포함)의 KST 가입일 코호트별 크기와, 가입 1·7·30일 뒤에 활동일이 있는 비율(0~1, 소수 넷째 자리)이다.
 * 그 날이 아직 오지 않았으면 null이다. 최신 코호트부터 준다.
 */
export function signupRetention(db: Executor): Promise<unknown[]> {
  const ratio = (offset: number) => sql`case when c.day + ${offset}::int <= t.d then round(count(*) filter (where exists (
      select 1 from public.user_active_days a where a.user_id = c.id and a.day = c.day + ${offset}::int))::numeric / count(*), 4) end`;
  return jsonRows(db, sql`with today as (
      select (now() at time zone 'Asia/Seoul')::date as d
    ),
    cohort as (
      select u.id, (u.created_at at time zone 'Asia/Seoul')::date as day
      from auth.users u, today t
      where u.created_at >= (t.d - 59)::timestamp at time zone 'Asia/Seoul'
    )
    select c.day, count(*)::int as size, ${ratio(1)} as d1, ${ratio(7)} as d7, ${ratio(30)} as d30
    from cohort c cross join today t
    group by c.day, t.d`, sql`t.day desc`);
}

/** 접속 세션 목록. 시작이 늦은 순으로 limit건(1~500, 기본 100)이고, 사용자를 주면 그 사람의 세션만 준다 */
export function sessions(db: Executor, userId: string | null, limit: number | null): Promise<unknown[]> {
  return jsonRows(db, sql`select s.id, s.user_id as "userId", p.nickname as nick,
      s.started_at as "startedAt", s.ended_at as "endedAt", s.duration_sec as "durationSec"
    from public.play_sessions s
    left join public.profiles p on p.user_id = s.user_id
    where ${userId}::uuid is null or s.user_id = ${userId}::uuid
    order by s.started_at desc, s.id desc
    limit least(greatest(coalesce(${limit}::int, 100), 1), 500)`, sql`t."startedAt" desc, t.id desc`);
}

/** 개요 탭 통합 조회 — 명부, 최근 이벤트, 스팸 플래그, 일별 집계, 리텐션, 최근 세션, 실시간 접속을 한 요청에 모은다 */
export async function overview(db: Executor, days: number, online: readonly LiveOnline[]): Promise<unknown> {
  const kstToday = Date.parse(new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10));
  const to = new Date(kstToday).toISOString().slice(0, 10);
  const from = new Date(kstToday - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const [userRows, recentEventRows, spamFlagRows, dailyStatRows, retentionRows, sessionRows, known] = await Promise.all([
    users(db),
    recentEvents(db),
    spamFlags(db),
    dailyStats(db, from, to),
    signupRetention(db),
    sessions(db, null, 500),
    online.length > 0 ? identities(db, online.map(entry => entry.uid)) : Promise.resolve(new Map()),
  ]);
  return {
    users: userRows,
    recentEvents: recentEventRows,
    spamFlags: spamFlagRows,
    dailyStats: dailyStatRows,
    retention: retentionRows,
    sessions: sessionRows,
    live: {
      count: online.length,
      online: online.map(entry => ({ ...entry, nickname: null, email: null, ...known.get(entry.uid) })),
    },
  };
}
