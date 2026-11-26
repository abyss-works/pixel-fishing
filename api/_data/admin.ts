// 관리자 읽기·명부 조회·감사 로그·비식별 투영 모듈.
// 뷰 본문의 관리자 판정(is_admin)은 호출하는 쪽이 adminMember/isAdmin/isStaff로 먼저 한다.
// 행은 Postgres JSON 직렬화 그대로다. 시각은 '2030-01-01T00:00:00+00:00' 형식의 문자열, 날짜는 'yyyy-mm-dd', 수는 수다.
// 뷰가 순서를 정하지 않는 조회에는 같은 요청이 같은 순서를 받도록 정렬을 둔다.
import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { ACHIEVEMENTS } from '../../src/game/content/achievements.js';
import { ARTIFACTS, artifactById, artifactHasLevel } from '../../src/game/content/artifacts.js';
import { BOATS } from '../../src/game/content/boats.js';
import { bountyById } from '../../src/game/content/bounties.js';
import { ENERGY_ITEM_IDS, RECIPES, recipeById } from '../../src/game/content/cooking.js';
import { FISH, fishById } from '../../src/game/content/fish.js';
import { NAMED } from '../../src/game/content/named.js';
import { spotById } from '../../src/game/content/spots.js';
import type { SpotId } from '../../src/game/content/spots.js';
import { HATS, hatById } from '../../src/game/content/wardrobe.js';
import { ZONES, zoneById } from '../../src/game/content/zones.js';
import type { ZoneId } from '../../src/game/content/zones.js';
import type { LiveOnline } from '../_server/live.js';
import { deriveAchievements } from './achievements.js';
import { uuidArray } from './json.js';

const FISH_IDS = new Set(FISH.map(f => f.id));
const NAMED_IDS = new Set(NAMED.map(n => n.id));
const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(a => a.id));

export type AdminRole = 'admin' | 'maintainer';

export interface AdminMember {
  role: AdminRole;
  showStaffBadge: boolean;
}

/** 서버 비밀키 기반 결정적 불투명 운영 핸들(`op_` + HMAC-SHA256 10자리 hex)을 생성한다 */
export function opHandle(uid: string): string {
  const configured = process.env.BETTER_AUTH_SECRET || process.env.ADMIN_HANDLE_SECRET;
  if (!configured && process.env.DEPLOY_ENV === 'production') throw new Error('ADMIN_HANDLE_SECRET missing in production');
  const secret = configured || 'dev-op-handle-secret';
  const digest = createHmac('sha256', secret).update(uid, 'utf8').digest('hex');
  return `op_${digest.slice(0, 10)}`;
}

/** 관리자 명부(admins)에서 역할과 채팅 배지 노출 설정을 조회한다. 알 수 없는 역할은 fail-closed로 null을 돌려준다 */
export async function adminMember(db: Executor, uid: string): Promise<AdminMember | null> {
  const { rows } = await db.execute<{ role: string; show_staff_badge: boolean }>(
    sql`select role, show_staff_badge from public.admins where user_id = ${uid}::uuid`);
  const row = rows[0];
  if (!row) return null;
  if (row.role !== 'admin' && row.role !== 'maintainer') return null;
  return { role: row.role, showStaffBadge: Boolean(row.show_staff_badge) };
}

/** 사용자가 관리자 명부(admins)에 등록된 운영진('admin' 또는 'maintainer')인가 */
export async function isStaff(db: Executor, uid: string): Promise<boolean> {
  const { rows } = await db.execute<{ staff: boolean }>(
    sql`select exists (select 1 from public.admins where user_id = ${uid}::uuid and role in ('admin', 'maintainer')) as staff`);
  return rows[0].staff;
}

/** 사용자가 1계층 관리자(role = 'admin')인가. 'maintainer'는 항상 false다 */
export async function isAdmin(db: Executor, uid: string): Promise<boolean> {
  const { rows } = await db.execute<{ admin: boolean }>(
    sql`select exists (select 1 from public.admins where user_id = ${uid}::uuid and role = 'admin') as admin`);
  return rows[0].admin;
}

/** 호출자 본인의 채팅 운영진 배지 노출 설정을 갱신한다. 명부에 없으면 false를 돌려준다 */
export async function setAdminStaffBadge(db: Executor, uid: string, show: boolean): Promise<boolean> {
  const { rows } = await db.execute<{ user_id: string }>(sql`
    update public.admins
    set show_staff_badge = ${show}
    where user_id = ${uid}::uuid
    returning user_id::text as user_id`);
  return rows.length > 0;
}

/** 불변 감사 로그(admin_audit_logs)에 관리자·메인테이너 조치 기록을 남긴다 */
export async function insertAdminAuditLog(
  db: Executor,
  entry: {
    actorId: string;
    actorRole: AdminRole;
    action: string;
    targetId?: string | null;
    reason?: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  const targetExpr = entry.targetId ? sql`${entry.targetId}::uuid` : sql`null`;
  await db.execute(sql`
    insert into public.admin_audit_logs (actor_id, actor_role, action, target_id, reason, detail)
    values (
      ${entry.actorId}::uuid,
      ${entry.actorRole},
      ${entry.action},
      ${targetExpr},
      ${entry.reason ?? ''},
      ${JSON.stringify(entry.detail ?? {})}::jsonb
    )`);
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

interface MaintainerUserSourceRow {
  user_id: string;
  nickname: string | null;
  boat: number | null;
  restricted: boolean | null;
}

function projectMaintainerUser(row: MaintainerUserSourceRow) {
  const handle = opHandle(row.user_id);
  return {
    user_id: handle,
    opHandle: handle,
    email: null,
    nickname: row.nickname,
    is_anonymous: null,
    signed_up_at: null,
    last_sign_in_at: null,
    gold: null,
    fame: null,
    boat: row.boat,
    rod: null,
    location_kind: null,
    location_id: null,
    visited: null,
    restricted: row.restricted,
    save_version: null,
    last_action_at: null,
    last_session_at: null,
    total_session_sec: 0,
  };
}

/**
 * 사용자 명부. 인증 계정과 닉네임, 현재 저장 상태를 잇고(마지막 로그인은 세션의 마지막 사용 시각이다), 최근 행동순으로 정렬하며 행동이 없는 계정은 뒤에 둔다.
 * 마지막 세션(last_session_at)은 접속 세션이 가장 늦게 끝난 시각, 누적 세션(total_session_sec)은 접속 세션 길이의 합(초)이다.
 * maintainer 역할에는 이메일·원본 uid·가입/로그인 시각·재화 등 개인정보를 조회·노출하지 않는 비식별 투영을 돌려준다.
 */
export async function users(db: Executor, role: AdminRole = 'admin'): Promise<unknown[]> {
  if (role === 'maintainer') {
    const rows = await jsonRows(db, sql`select u.id::text as user_id,
        p.nickname,
        c.boat,
        c.restricted,
        c.updated_at as last_action_at
      from auth.users u
      left join public.profiles p on p.user_id = u.id
      left join public.saves_current c on c.user_id = u.id`, sql`t.last_action_at desc nulls last, t.user_id`) as MaintainerUserSourceRow[];
    return rows.map(projectMaintainerUser);
  }
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

/** 닉네임만 조회한다(이메일 미조회 — maintainer 비식별 실시간 접속 투영용) */
async function nicknames(db: Executor, uids: readonly string[]): Promise<Map<string, string | null>> {
  const { rows } = await db.execute<{ user_id: string; nickname: string | null }>(sql`select user_id::text as user_id, nickname
    from public.profiles
    where user_id = any(${uuidArray(uids)})`);
  return new Map(rows.map(row => [row.user_id, row.nickname]));
}

/** 실시간 접속 목록을 역할에 맞춰 투영한다(maintainer는 이메일 생략·opHandle 치환) */
export async function liveSnapshot(
  db: Executor,
  online: readonly LiveOnline[],
  role: AdminRole = 'admin',
): Promise<{ count: number; online: unknown[] }> {
  if (role === 'maintainer') {
    const nickMap = online.length > 0 ? await nicknames(db, online.map(entry => entry.uid)) : new Map<string, string | null>();
    return {
      count: online.length,
      online: online.map(entry => {
        const handle = opHandle(entry.uid);
        return {
          uid: handle,
          opHandle: handle,
          nick: entry.nick,
          nickname: nickMap.get(entry.uid) ?? null,
          region: entry.region,
          zone: entry.zone,
          connectedAt: entry.connectedAt,
          guest: entry.guest,
        };
      }),
    };
  }
  const known = online.length > 0 ? await identities(db, online.map(entry => entry.uid)) : new Map();
  return {
    count: online.length,
    online: online.map(entry => ({ ...entry, nickname: null, email: null, ...known.get(entry.uid) })),
  };
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
    records: { fish_id: string; form: string; count: number; max_size: number | null; first_caught: string | null }[];
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
      (select coalesce(json_agg(json_build_object(
         'fish_id', fish_id, 'form', form, 'count', count, 'max_size', max_size, 'first_caught', first_caught
       )), '[]'::json)
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

  const evaluatedAchievements = deriveAchievements({
    data,
    records,
    counters,
    clearedNamed,
  }).achievements;
  let claimed = 0;
  let claimable = 0;
  for (const [id, status] of Object.entries(evaluatedAchievements)) {
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
        id: typeof rawCooking.id === 'string' ? rawCooking.id : null,
        recipe: rawCooking.recipe,
        name: recipeById(rawCooking.recipe)?.name ?? rawCooking.recipe,
        count: asNum(rawCooking.count),
        startedAt: typeof rawCooking.startedAt === 'string' ? rawCooking.startedAt : '',
      }
    : null;
  const queue = (Array.isArray(data.cookingQueue) ? data.cookingQueue : []).flatMap(entry => {
    const q = asRecord(entry);
    if (typeof q.recipe !== 'string') return [];
    return [{
      id: typeof q.id === 'string' ? q.id : null,
      recipe: q.recipe,
      name: recipeById(q.recipe)?.name ?? q.recipe,
      count: asNum(q.count),
    }];
  });
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
      queue,
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
export async function spamFlags(db: Executor, role: AdminRole = 'admin'): Promise<unknown[]> {
  const rows = await jsonRows(db, sql`with c as (
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
    from per_user p cross join glob g`, sql`t.user_id`) as {
    user_id: string;
    catches_7d: number;
    fast_gap_7d: number;
    perfect_pct: number | null;
    perfect_pct_global: number | null;
  }[];
  if (role !== 'maintainer') return rows;
  return rows.map(row => {
    const handle = opHandle(row.user_id);
    return { ...row, user_id: handle, opHandle: handle };
  });
}

function sanitizeEventPayloadForMaintainer(type: string, payload: unknown): Record<string, unknown> {
  if (type === 'letter') return {};
  const obj = asRecord(payload);
  if (typeof obj.adminId === 'string') {
    return { ...obj, adminId: opHandle(obj.adminId) };
  }
  return obj;
}

/** 최근 이벤트 피드. 최신 80행, id 내림차순 */
export async function recentEvents(db: Executor, role: AdminRole = 'admin'): Promise<unknown[]> {
  const rows = await jsonRows(db, sql`select id, user_id, type, payload, created_at
    from public.events
    order by id desc
    limit 80`, sql`t.id desc`) as {
    id: number;
    user_id: string;
    type: string;
    payload: unknown;
    created_at: string;
  }[];
  if (role !== 'maintainer') return rows;
  return rows.map(row => ({
    ...row,
    user_id: opHandle(row.user_id),
    payload: sanitizeEventPayloadForMaintainer(row.type, row.payload),
  }));
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
export function changelog(db: Executor, role: AdminRole = 'admin'): Promise<unknown[]> {
  const filter = role === 'maintainer' ? sql`where c.tier = 'public'` : sql``;
  return jsonRows(db, sql`select c.id, c.version, c.date, c.seq, c.tier, c.tag, c.text, c.withdrawn_at as "withdrawnAt"
    from public.changelog_entries c ${filter}`, sql`string_to_array(t.version, '.')::int[] desc, t.seq, t.id`);
}

/** 채팅 신고 목록. 최근 신고 200건, 최신순. lines는 신고한 메시지와 앞뒤 대화의 복사본이다 */
export async function chatReports(db: Executor, role: AdminRole = 'admin'): Promise<unknown[]> {
  const rows = await jsonRows(db, sql`select r.id, r.user_id, r.message_id, r.target_id, r.lines, r.created_at
    from public.chat_reports r
    order by r.created_at desc, r.id desc
    limit 200`, sql`t.created_at desc, t.id desc`) as {
    id: number;
    user_id: string;
    message_id: number;
    target_id: string;
    lines: { id?: unknown; uid?: unknown; nick?: unknown; text?: unknown; at?: unknown }[];
    created_at: string;
  }[];
  if (role !== 'maintainer') return rows;
  return rows.map(row => {
    const targetHandle = opHandle(row.target_id);
    return {
      ...row,
      user_id: '',
      target_id: targetHandle,
      opHandle: targetHandle,
      lines: Array.isArray(row.lines)
        ? row.lines.map(line => ({
            ...line,
            uid: typeof line.uid === 'string' ? opHandle(line.uid) : '',
          }))
        : [],
    };
  });
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
export async function sessions(
  db: Executor,
  userId: string | null,
  limit: number | null,
  role: AdminRole = 'admin',
): Promise<unknown[]> {
  const effectiveUserId = role === 'maintainer' ? null : userId;
  const rows = await jsonRows(db, sql`select s.id, s.user_id as "userId", p.nickname as nick,
      s.started_at as "startedAt", s.ended_at as "endedAt", s.duration_sec as "durationSec"
    from public.play_sessions s
    left join public.profiles p on p.user_id = s.user_id
    where ${effectiveUserId}::uuid is null or s.user_id = ${effectiveUserId}::uuid
    order by s.started_at desc, s.id desc
    limit least(greatest(coalesce(${limit}::int, 100), 1), 500)`, sql`t."startedAt" desc, t.id desc`) as {
    id: number;
    userId: string;
    nick: string | null;
    startedAt: string;
    endedAt: string;
    durationSec: number;
  }[];
  if (role !== 'maintainer') return rows;
  return rows.map(row => {
    const handle = opHandle(row.userId);
    return { ...row, userId: handle, opHandle: handle };
  });
}

const AGGREGATE_DAY_MS = 86_400_000;
const AGGREGATE_KST_OFFSET_MS = 9 * 3_600_000;
const OPEN_WORLD_REGIONS = ['village', 'world'] as const;
const OPEN_WORLD_ZONE_UNLOCKS = ZONES.filter(z => !z.parent).map(z => ({
  id: z.id,
  entryBoat: z.entryBoat ?? (z.id === 'village' ? 0 : 1),
}));

export interface AdminUserAggregates {
  totalUsers: number;
  activePlayers: number;
  asOf: string;
  activeUsers: { today: number; week: number; month: number };
  newToday: { users: number; accounts: number };
  gold: { count: number; sum: number; median: number | null; p75: number | null; max: number | null };
  progression: {
    boats: { tier: number; count: number }[];
    rods: { level: number; count: number }[];
    regionReach: { id: string; count: number }[];
    zoneUnlocks: { id: string; count: number }[];
    fameGateStalled: { total: number; byNextTier: { nextTier: number; count: number }[] };
  };
}

export interface AggregateUserRow {
  user_id: string;
  is_anonymous: boolean | null;
  signed_up_at: string | null;
  gold: number | string | null;
  fame: number | string | null;
  boat: number | null;
  rod: number | null;
  visited: unknown;
  restricted: boolean | null;
  last_action_at: string | null;
  last_session_at: string | null;
}

const kstDayOfMs = (ms: number): string =>
  new Date(ms + AGGREGATE_KST_OFFSET_MS).toISOString().slice(0, 10);

const msOf = (iso: string | null | undefined): number =>
  (iso ? Date.parse(iso) : NaN);

const numOrNaN = (value: number | string | null): number =>
  (value === null ? NaN : Number(value));

const percentileOf = (sorted: readonly number[], p: number): number | null => {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};

function isDormantGuestRow(row: AggregateUserRow): boolean {
  if (row.is_anonymous !== true || row.restricted === true) return false;
  return (row.gold === null || numOrNaN(row.gold) === 0)
    && (row.fame === null || numOrNaN(row.fame) === 0);
}

/** 원시 사용자 명부 행으로부터 개요·경제·진행 대시보드용 비식별 순수 수치 집계를 계산한다 */
export function computeUserAggregates(
  rows: readonly AggregateUserRow[],
  nowMs: number = Date.now(),
): AdminUserAggregates {
  const todayKst = kstDayOfMs(nowMs);
  let activeToday = 0;
  let activeWeek = 0;
  let activeMonth = 0;
  let newUsersToday = 0;
  let newAccountsToday = 0;

  for (const row of rows) {
    const seenCandidates = [msOf(row.last_action_at), msOf(row.last_session_at)].filter(Number.isFinite);
    if (seenCandidates.length > 0) {
      const seen = Math.max(...seenCandidates);
      if (kstDayOfMs(seen) === todayKst) activeToday++;
      if (nowMs - seen < 7 * AGGREGATE_DAY_MS) activeWeek++;
      if (nowMs - seen < 30 * AGGREGATE_DAY_MS) activeMonth++;
    }
    const signedUp = msOf(row.signed_up_at);
    if (Number.isFinite(signedUp) && kstDayOfMs(signedUp) === todayKst) {
      newUsersToday++;
      if (row.is_anonymous === false) newAccountsToday++;
    }
  }

  const goldValues = rows
    .map(row => numOrNaN(row.gold))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const goldSum = goldValues.reduce((sum, value) => sum + value, 0);

  const activeRows = rows.filter(row => !isDormantGuestRow(row));
  const boatCounts = Array.from({ length: BOATS.length + 1 }, () => 0);
  const rodCounts = new Map<number, number>();
  const regionCounts = new Map<string, number>(OPEN_WORLD_REGIONS.map(id => [id, 0]));
  const zoneCounts = new Map<string, number>(OPEN_WORLD_ZONE_UNLOCKS.map(z => [z.id, 0]));
  const stalledCounts = new Map<number, number>();
  let stalledTotal = 0;

  for (const row of activeRows) {
    const boatTier = row.boat ?? 0;
    if (boatTier >= 0 && boatTier <= BOATS.length) {
      boatCounts[boatTier]++;
    }

    const rodLevel = row.rod ?? 1;
    if (rodLevel >= 1) {
      rodCounts.set(rodLevel, (rodCounts.get(rodLevel) ?? 0) + 1);
    }

    const visited = Array.isArray(row.visited) ? row.visited : [];
    for (const id of OPEN_WORLD_REGIONS) {
      if (visited.includes(id)) {
        regionCounts.set(id, (regionCounts.get(id) ?? 0) + 1);
      }
    }

    for (const zone of OPEN_WORLD_ZONE_UNLOCKS) {
      if (boatTier >= zone.entryBoat) {
        zoneCounts.set(zone.id, (zoneCounts.get(zone.id) ?? 0) + 1);
      }
    }

    const nextBoat = BOATS.find(boat => boat.tier === boatTier + 1);
    if (nextBoat) {
      const fame = numOrNaN(row.fame);
      if (fame < nextBoat.fameReq) {
        stalledTotal++;
        stalledCounts.set(nextBoat.tier, (stalledCounts.get(nextBoat.tier) ?? 0) + 1);
      }
    }
  }

  return {
    totalUsers: rows.length,
    activePlayers: activeRows.length,
    asOf: new Date(nowMs).toISOString(),
    activeUsers: {
      today: activeToday,
      week: activeWeek,
      month: activeMonth,
    },
    newToday: {
      users: newUsersToday,
      accounts: newAccountsToday,
    },
    gold: {
      count: goldValues.length,
      sum: goldSum,
      median: percentileOf(goldValues, 50),
      p75: percentileOf(goldValues, 75),
      max: goldValues.length > 0 ? goldValues[goldValues.length - 1] : null,
    },
    progression: {
      boats: boatCounts.map((count, tier) => ({ tier, count })),
      rods: [...rodCounts.entries()].sort(([a], [b]) => a - b).map(([level, count]) => ({ level, count })),
      regionReach: OPEN_WORLD_REGIONS.map(id => ({ id, count: regionCounts.get(id) ?? 0 })),
      zoneUnlocks: OPEN_WORLD_ZONE_UNLOCKS.map(z => ({ id: z.id, count: zoneCounts.get(z.id) ?? 0 })),
      fameGateStalled: {
        total: stalledTotal,
        byNextTier: [...stalledCounts.entries()].sort(([a], [b]) => a - b).map(([nextTier, count]) => ({ nextTier, count })),
      },
    },
  };
}

async function overviewUsers(
  db: Executor,
  role: AdminRole,
  nowMs: number,
): Promise<{ userRows: unknown[]; userAggregates: AdminUserAggregates }> {
  if (role !== 'maintainer') {
    const rawRows = await users(db, 'admin') as AggregateUserRow[];
    return {
      userRows: rawRows,
      userAggregates: computeUserAggregates(rawRows, nowMs),
    };
  }
  const rawRows = await jsonRows(db, sql`select u.id::text as user_id,
      p.nickname,
      u.is_anonymous,
      u.created_at as signed_up_at,
      c.gold, c.fame, c.boat, c.rod,
      c.data -> 'visited' as visited,
      c.restricted,
      c.updated_at as last_action_at,
      ps.last_session_at
    from auth.users u
    left join (select user_id, max(ended_at) as last_session_at
      from public.play_sessions group by user_id) ps on ps.user_id = u.id
    left join public.profiles p on p.user_id = u.id
    left join public.saves_current c on c.user_id = u.id`, sql`t.last_action_at desc nulls last, t.user_id`) as (AggregateUserRow & MaintainerUserSourceRow)[];
  return {
    userRows: rawRows.map(projectMaintainerUser),
    userAggregates: computeUserAggregates(rawRows, nowMs),
  };
}

/** 개요 탭 통합 조회 — 명부, 비식별 사전 집계, 최근 이벤트, 스팸 플래그, 일별 집계, 리텐션, 최근 세션, 실시간 접속을 한 요청에 모은다 */
export async function overview(
  db: Executor,
  days: number,
  online: readonly LiveOnline[],
  role: AdminRole = 'admin',
): Promise<unknown> {
  const nowMs = Date.now();
  const kstToday = Date.parse(new Date(nowMs + AGGREGATE_KST_OFFSET_MS).toISOString().slice(0, 10));
  const to = new Date(kstToday).toISOString().slice(0, 10);
  const from = new Date(kstToday - (days - 1) * AGGREGATE_DAY_MS).toISOString().slice(0, 10);
  const [{ userRows, userAggregates }, recentEventRows, spamFlagRows, dailyStatRows, retentionRows, sessionRows, live] = await Promise.all([
    overviewUsers(db, role, nowMs),
    recentEvents(db, role),
    spamFlags(db, role),
    dailyStats(db, from, to),
    signupRetention(db),
    sessions(db, null, 500, role),
    liveSnapshot(db, online, role),
  ]);
  return {
    users: userRows,
    userAggregates,
    recentEvents: recentEventRows,
    spamFlags: spamFlagRows,
    dailyStats: dailyStatRows,
    retention: retentionRows,
    sessions: sessionRows,
    live,
  };
}
