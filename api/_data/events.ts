// 라이브 이벤트(live_events·event_trio_progress·event_championship_scores·event_draws) 소유 모듈.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { EVENT1_TRIO_TARGETS } from '../../src/game/content/eventFish.js';
import type { EventTrioTarget } from '../../src/game/content/eventFish.js';
import { fishById } from '../../src/game/content/fish.js';
import { isAttachableItemId, itemStorageAmount } from '../../src/game/content/itemCatalog.js';
import { hatById, safeLook } from '../../src/game/content/wardrobe.js';
import { fortuneScoreOf } from '../../src/game/rules/fortune.js';
import type { FortuneKind } from '../../src/game/rules/fortune.js';
import { ITEM_CAP } from '../../src/game/rules/logic.js';
import { gameDayOf } from '../../src/game/rules/time.js';
import type { Database, Executor } from '../_db/client.js';
import { at, textArray } from './json.js';
import { MAIL_GOLD_MAX, sendMails } from './mailbox.js';
import type { MailItemAttachment } from './mailbox.js';

export type LiveEventKind = 'trio' | 'championship' | 'draw';

export interface LiveEventSummary {
  id: string;
  kind: LiveEventKind;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  config: Record<string, unknown>;
}

export interface EventTrioSlotStatus {
  fishId: string;
  form: 'normal' | 'variant';
  completed: boolean;
  completedAt: string | null;
}

export interface EventTrioState {
  eventId: string;
  slots: EventTrioSlotStatus[];
  completedAt: string | null;
  claimedAt: string | null;
  won: boolean;
  rewardPin: string | null;
  rewardExpiresAt: string | null;
}

export interface EventLeaderboardRow {
  rank: number;
  userId: string;
  nickname: string | null;
  score: number;
  catches?: number;
  look?: { shirt: number; pants: number; hat: string | null } | null;
  me: boolean;
}

export interface EventChampionshipState {
  eventId: string;
  score: number;
  bestFishId: string | null;
  bestFishScore: number;
  catches: number;
  dex: Record<string, { normal: number; variant: number }>;
  hatsGranted: string[];
  pendingGold: number;
  pendingFame: number;
  rank: number | null;
  top: EventLeaderboardRow[];
}

export interface EventLuckDayStamp {
  day: string;
  kind: FortuneKind | null;
  index: 3 | 5 | null;
  score: number | null;
}

export interface EventDrawState {
  eventId: string;
  totalScore: number;
  attendedDays: number;
  days: EventLuckDayStamp[];
  rank: number | null;
  top: EventLeaderboardRow[];
  won: boolean;
}

export interface EventsSnapshot {
  now: string;
  events: LiveEventSummary[];
  trio: EventTrioState | null;
  championship: EventChampionshipState | null;
  draw: EventDrawState | null;
}

export interface AdminLiveEventRow extends LiveEventSummary {
  createdAt: string;
  updatedAt: string;
}

export interface AdminEventDrawRow {
  id: number;
  eventId: string;
  userId: string;
  nickname: string | null;
  rewardKind: 'gold' | 'item' | 'hat' | 'none';
  rewardId: string | null;
  rewardQty: number;
  gold: number;
  rewardPin: string | null;
  rewardExpiresAt: string | null;
  mailId: number | null;
  seed: string;
  drawnBy: string | null;
  createdAt: string;
}

export const EVENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
export const EVENT_TITLE_MAX = 100;
export const EVENT_DESC_MAX = 2000;
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TOP_LIMIT = 10;

const isoOf = (column: string) =>
  sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

const nullableIsoOf = (column: string) =>
  sql.raw(`case when ${column} is null then null else to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end`);

type RawLiveEventRow = {
  id: string;
  kind: LiveEventKind;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
  config: unknown;
  created_at: string;
  updated_at: string;
};

const asConfig = (raw: unknown): Record<string, unknown> =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};

const toSummary = (r: RawLiveEventRow): LiveEventSummary => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  description: r.description,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  active: Boolean(r.active),
  config: asConfig(r.config),
});

const toAdminRow = (r: RawLiveEventRow): AdminLiveEventRow => ({
  ...toSummary(r),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** 이벤트 1 목표 어종 슬롯 3종을 config.targets에서 읽거나 기본 목표를 돌려준다 */
export function trioTargetsOf(config: Record<string, unknown> | null | undefined): readonly EventTrioTarget[] {
  const raw = config?.targets;
  if (!Array.isArray(raw) || raw.length !== 3) return EVENT1_TRIO_TARGETS;
  const parsed: EventTrioTarget[] = [];
  for (const el of raw) {
    if (typeof el !== 'object' || el === null) return EVENT1_TRIO_TARGETS;
    const { fishId, form } = el as { fishId?: unknown; form?: unknown };
    if (typeof fishId !== 'string' || !fishById(fishId)) return EVENT1_TRIO_TARGETS;
    if (form !== 'normal' && form !== 'variant') return EVENT1_TRIO_TARGETS;
    parsed.push({ fishId, form });
  }
  return parsed;
}

/** 이벤트 기간([startsAt, endsAt))에 해당하는 KST 04:00 경계 게임 날짜 목록을 오름차순으로 계산한다 */
export function eventDaysInRange(
  startsAt: string,
  endsAt: string,
  config?: Record<string, unknown> | null,
): string[] {
  const rawDays = config?.days;
  if (Array.isArray(rawDays) && rawDays.length > 0 && rawDays.every(d => typeof d === 'string' && DATE_RE.test(d))) {
    return [...new Set(rawDays as string[])].sort();
  }
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const startDay = gameDayOf(new Date(startMs).toISOString());
  const endDay = gameDayOf(new Date(Math.max(startMs, endMs - 1)).toISOString());
  const out: string[] = [];
  let curMs = Date.parse(`${startDay}T00:00:00.000Z`);
  const stopMs = Date.parse(`${endDay}T00:00:00.000Z`);
  for (let i = 0; i < 366 && curMs <= stopMs; i++, curMs += DAY_MS) {
    out.push(new Date(curMs).toISOString().slice(0, 10));
  }
  return out;
}

const EVENT_COLS = sql`id,
  kind,
  title,
  description,
  ${isoOf('starts_at')} as starts_at,
  ${isoOf('ends_at')} as ends_at,
  active,
  config,
  ${isoOf('created_at')} as created_at,
  ${isoOf('updated_at')} as updated_at`;

const toSummaryAt = (r: RawLiveEventRow, nowMs: number): LiveEventSummary => {
  const summary = toSummary(r);
  const startMs = Date.parse(summary.startsAt);
  const endMs = Date.parse(summary.endsAt);
  return {
    ...summary,
    active: summary.active && Number.isFinite(nowMs) && startMs <= nowMs && nowMs < endMs,
  };
};

/** 현재 시각에 진행 중인 특정 종류의 라이브 이벤트를 모두 조회한다 */
export async function activeEventsOfKind(
  db: Executor,
  kind: LiveEventKind,
  nowISO: string,
): Promise<LiveEventSummary[]> {
  const { rows } = await db.execute<RawLiveEventRow>(sql`select ${EVENT_COLS}
    from public.live_events
    where kind = ${kind}
      and active
      and starts_at <= ${at(nowISO)}
      and ends_at > ${at(nowISO)}
    order by starts_at desc, created_at desc`);
  const nowMs = Date.parse(nowISO);
  return rows.map(r => toSummaryAt(r, nowMs));
}

/** 현재 시각에 진행 중인 특정 종류의 대표 이벤트 1건을 조회한다 */
export async function activeEventOfKind(
  db: Executor,
  kind: LiveEventKind,
  nowISO: string,
): Promise<LiveEventSummary | null> {
  const list = await activeEventsOfKind(db, kind, nowISO);
  return list[0] ?? null;
}

/** 플레이어에게 노출할 활성·예정·최근 종료(7일 이내) 라이브 이벤트 목록을 조회한다 */
export async function listVisibleLiveEvents(
  db: Executor,
  nowISO: string,
): Promise<LiveEventSummary[]> {
  const nowSql = at(nowISO);
  const { rows } = await db.execute<RawLiveEventRow>(sql`select ${EVENT_COLS}
    from public.live_events
    where active
      and ends_at > ${nowSql} - interval '7 days'
    order by
      case
        when starts_at <= ${nowSql} and ends_at > ${nowSql} then 0
        when starts_at > ${nowSql} then 1
        else 2
      end asc,
      starts_at desc,
      created_at desc`);
  const nowMs = Date.parse(nowISO);
  return rows.map(r => toSummaryAt(r, nowMs));
}

// ---------- 이벤트 1: 삼총사를 낚아라 ----------

/** 확정 가드와 함께 일반 해역 어획이 이벤트 1 목표와 일치하면 진행도와 완료 시각을 원자적으로 갱신한다 */
export function upsertTrioProgressFragment(
  guard: SQL,
  uid: string,
  eventId: string,
  targets: readonly EventTrioTarget[],
  fishId: string,
  form: 'normal' | 'variant',
  nowISO: string,
): SQL | null {
  if (!targets.some(t => t.fishId === fishId && t.form === form)) return null;
  const slotKey = `${fishId}:${form}`;
  const slotAtKey = `${slotKey}:at`;
  const nowMs = Date.parse(nowISO);
  const requiredKeys = [...new Set(targets.map(t => `${t.fishId}:${t.form}`))];
  const reqArr = textArray(requiredKeys);
  return sql`insert into public.event_trio_progress (event_id, user_id, counts, completed_at, updated_at)
    select
      ${eventId}::text,
      ${uid}::uuid,
      jsonb_build_object(${slotKey}::text, 1, ${slotAtKey}::text, ${nowMs}::bigint),
      case when ${requiredKeys.length <= 1}::boolean then ${at(nowISO)} else null end,
      ${at(nowISO)}
    where ${guard}
    on conflict (event_id, user_id) do update set
      counts = event_trio_progress.counts
        || jsonb_build_object(${slotKey}::text, coalesce((event_trio_progress.counts->>${slotKey}::text)::int, 0) + 1)
        || case
          when event_trio_progress.counts ? ${slotAtKey}::text then '{}'::jsonb
          else jsonb_build_object(${slotAtKey}::text, ${nowMs}::bigint)
        end,
      completed_at = coalesce(
        event_trio_progress.completed_at,
        case when (
          (event_trio_progress.counts || jsonb_build_object(${slotKey}::text, coalesce((event_trio_progress.counts->>${slotKey}::text)::int, 0) + 1)) ?& ${reqArr}
        ) then ${at(nowISO)} else null end
      ),
      updated_at = ${at(nowISO)}`;
}

async function loadTrioState(db: Executor, uid: string, event: LiveEventSummary): Promise<EventTrioState> {
  const { rows } = await db.execute<{
    counts: Record<string, number> | null;
    completed_at: string | null;
    claimed_at: string | null;
    updated_at: string | null;
    reward_pin: string | null;
    reward_expires_at: string | null;
    has_draw: boolean;
  }>(sql`select
      p.counts,
      ${nullableIsoOf('p.completed_at')} as completed_at,
      ${nullableIsoOf(`coalesce(
        p.claimed_at,
        m.claimed_at,
        case
          when m.id is not null
            and m.gold = 0
            and jsonb_array_length(m.items) = 0
            and jsonb_array_length(m.hats) = 0
          then m.read_at
          else null
        end
      )`)} as claimed_at,
      ${nullableIsoOf('p.updated_at')} as updated_at,
      d.reward_pin,
      d.reward_expires_at,
      (d.id is not null) as has_draw
    from (select 1) dummy
    left join public.event_trio_progress p on p.event_id = ${event.id} and p.user_id = ${uid}::uuid
    left join lateral (
      select id, mail_id, reward_pin, reward_expires_at
      from public.event_draws
      where event_id = ${event.id} and user_id = ${uid}::uuid
      order by created_at desc, id desc
      limit 1
    ) d on true
    left join public.mails m on m.id = d.mail_id`);
  const r = rows[0];
  const counts = r?.counts && typeof r.counts === 'object' ? r.counts : {};
  const targets = trioTargetsOf(event.config);
  const slots: EventTrioSlotStatus[] = targets.map(t => {
    const key = `${t.fishId}:${t.form}`;
    const cnt = Number(counts[key] ?? 0);
    const completed = cnt > 0;
    const rawAt = counts[`${key}:at`];
    const completedAt = !completed
      ? null
      : typeof rawAt === 'number' && Number.isFinite(rawAt)
        ? new Date(rawAt).toISOString()
        : (r?.completed_at ?? r?.updated_at ?? null);
    return { fishId: t.fishId, form: t.form, completed, completedAt };
  });
  return {
    eventId: event.id,
    slots,
    completedAt: r?.completed_at ?? null,
    claimedAt: r?.claimed_at ?? null,
    won: Boolean(r?.has_draw),
    rewardPin: r?.has_draw ? (r.reward_pin ?? null) : null,
    rewardExpiresAt: r?.has_draw ? (r.reward_expires_at ?? null) : null,
  };
}

// ---------- 이벤트 2: 강태공 선수권 대회 ----------

export interface ChampionshipScoreRow {
  eventId: string;
  score: number;
  bestFishId: string | null;
  bestFishScore: number;
  catches: number;
  dex: Record<string, { normal: number; variant: number }>;
  hatsGranted: string[];
  pendingGold: number;
  pendingFame: number;
}

function parseChampDex(raw: unknown): Record<string, { normal: number; variant: number }> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, { normal: number; variant: number }> = {};
  for (const [fishId, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const e = entry as { normal?: unknown; variant?: unknown };
    const normal = typeof e.normal === 'number' && Number.isFinite(e.normal) ? Math.max(0, Math.floor(e.normal)) : 0;
    const variant = typeof e.variant === 'number' && Number.isFinite(e.variant) ? Math.max(0, Math.floor(e.variant)) : 0;
    out[fishId] = { normal, variant };
  }
  return out;
}

function parseHatsGranted(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === 'string'))];
}

/** 플레이어의 특정 챔피언십 이벤트 참여 행을 읽는다 */
export async function readChampionshipRow(
  db: Executor,
  uid: string,
  eventId: string,
): Promise<ChampionshipScoreRow | null> {
  const { rows } = await db.execute<{
    event_id: string;
    score: number;
    best_fish_id: string | null;
    best_fish_score: number;
    catches: number;
    dex: unknown;
    hats_granted: unknown;
    pending_gold: number;
    pending_fame: number;
  }>(sql`select event_id, score, best_fish_id, best_fish_score, catches, dex, hats_granted, pending_gold, pending_fame
    from public.event_championship_scores
    where event_id = ${eventId} and user_id = ${uid}::uuid`);
  const r = rows[0];
  if (!r) return null;
  return {
    eventId: r.event_id,
    score: Number(r.score),
    bestFishId: r.best_fish_id,
    bestFishScore: Number(r.best_fish_score),
    catches: Number(r.catches),
    dex: parseChampDex(r.dex),
    hatsGranted: parseHatsGranted(r.hats_granted),
    pendingGold: Number(r.pending_gold),
    pendingFame: Number(r.pending_fame),
  };
}

/** 정산할 수 있는 미정산 저금통이 있는 챔피언십 행을 찾는다 */
export async function findSettleableChampionshipRow(
  db: Executor,
  uid: string,
  preferredEventId?: string,
): Promise<{ eventId: string; gold: number; fame: number } | null> {
  const { rows } = await db.execute<{ event_id: string; pending_gold: number; pending_fame: number }>(
    preferredEventId
      ? sql`select event_id, pending_gold, pending_fame
          from public.event_championship_scores
          where event_id = ${preferredEventId} and user_id = ${uid}::uuid
            and (pending_gold > 0 or pending_fame > 0)`
      : sql`select event_id, pending_gold, pending_fame
          from public.event_championship_scores
          where user_id = ${uid}::uuid and (pending_gold > 0 or pending_fame > 0)
          order by updated_at desc
          limit 1`,
  );
  const r = rows[0];
  if (!r) return null;
  return { eventId: r.event_id, gold: Number(r.pending_gold), fame: Number(r.pending_fame) };
}

/** 확정 가드와 함께 챔피언십 어획 점수·전용 도감·미정산 저금통·한정 모자 지급 이력을 원자적으로 갱신한다 */
export function upsertChampionshipCatchFragment(
  guard: SQL,
  uid: string,
  eventId: string,
  catchData: {
    fishId: string;
    form: 'normal' | 'variant';
    score: number;
    pendingGold: number;
    pendingFame: number;
    hatsToGrant: readonly string[];
  },
  nowISO: string,
): SQL {
  const { fishId, form, score, pendingGold, pendingFame, hatsToGrant } = catchData;
  const initDex = { [fishId]: { normal: form === 'normal' ? 1 : 0, variant: form === 'variant' ? 1 : 0 } };
  const addNormal = form === 'normal' ? 1 : 0;
  const addVariant = form === 'variant' ? 1 : 0;
  const hatsJson = JSON.stringify(hatsToGrant);
  const hatsUpdate = hatsToGrant.length > 0
    ? sql`(select coalesce(jsonb_agg(distinct val), '[]'::jsonb) from jsonb_array_elements_text(event_championship_scores.hats_granted || ${hatsJson}::jsonb) as val)`
    : sql`event_championship_scores.hats_granted`;

  return sql`insert into public.event_championship_scores (
      event_id, user_id, score, best_fish_id, best_fish_score, catches, dex, hats_granted, pending_gold, pending_fame, updated_at
    )
    select
      ${eventId}::text,
      ${uid}::uuid,
      ${score}::int,
      ${fishId}::text,
      ${score}::int,
      1,
      ${JSON.stringify(initDex)}::jsonb,
      ${hatsJson}::jsonb,
      ${pendingGold}::int,
      ${pendingFame}::int,
      ${at(nowISO)}
    where ${guard}
    on conflict (event_id, user_id) do update set
      score = event_championship_scores.score + ${score}::int,
      best_fish_id = case
        when ${score}::int > event_championship_scores.best_fish_score or event_championship_scores.best_fish_id is null
          then ${fishId}::text
        else event_championship_scores.best_fish_id
      end,
      best_fish_score = greatest(event_championship_scores.best_fish_score, ${score}::int),
      catches = event_championship_scores.catches + 1,
      dex = event_championship_scores.dex || jsonb_build_object(
        ${fishId}::text,
        jsonb_build_object(
          'normal', coalesce((event_championship_scores.dex->${fishId}::text->>'normal')::int, 0) + ${addNormal}::int,
          'variant', coalesce((event_championship_scores.dex->${fishId}::text->>'variant')::int, 0) + ${addVariant}::int
        )
      ),
      hats_granted = ${hatsUpdate},
      pending_gold = event_championship_scores.pending_gold + ${pendingGold}::int,
      pending_fame = event_championship_scores.pending_fame + ${pendingFame}::int,
      updated_at = ${at(nowISO)}`;
}

/** 수시 정산 선행 게이트 — 미정산 저금통 잔액이 남아 있을 때만 참이다 */
export function championshipSettleGate(uid: string, eventId: string): SQL {
  return sql`select 1 from public.event_championship_scores
    where event_id = ${eventId} and user_id = ${uid}::uuid and (pending_gold > 0 or pending_fame > 0)`;
}

/** 확정 가드와 함께 저금통 미정산 잔액을 0으로 정산한다(점수·도감·모자·동점 도달 시각은 유지) */
export function settleChampionshipFragment(guard: SQL, uid: string, eventId: string, nowISO: string): SQL {
  return sql`update public.event_championship_scores
    set pending_gold = 0, pending_fame = 0, settled_at = ${at(nowISO)}
    where event_id = ${eventId} and user_id = ${uid}::uuid
      and (pending_gold > 0 or pending_fame > 0)
      and ${guard}`;
}

async function loadChampionshipState(db: Executor, uid: string, event: LiveEventSummary): Promise<EventChampionshipState> {
  const { rows } = await db.execute<{
    mine: {
      score: number;
      best_fish_id: string | null;
      best_fish_score: number;
      catches: number;
      dex: unknown;
      hats_granted: unknown;
      pending_gold: number;
      pending_fame: number;
    } | null;
    my_rank: number | null;
    top: Array<{
      rank: number;
      user_id: string;
      nickname: string | null;
      score: number;
      catches: number;
      look: unknown;
    }>;
  }>(sql`with ranked as (
      select
        s.user_id,
        p.nickname,
        s.score,
        s.catches,
        sc.data->'look' as look,
        row_number() over (order by s.score desc, s.updated_at asc, s.user_id asc)::int as rank
      from public.event_championship_scores s
      join auth.users u on u.id = s.user_id and not u.is_anonymous
      left join public.saves_current sc on sc.user_id = s.user_id
      left join public.profiles p on p.user_id = s.user_id
      where s.event_id = ${event.id}
        and s.score > 0
        and not coalesce(sc.restricted, false)
    )
    select
      (select row_to_json(m) from (
        select score, best_fish_id, best_fish_score, catches, dex, hats_granted, pending_gold, pending_fame
        from public.event_championship_scores
        where event_id = ${event.id} and user_id = ${uid}::uuid
      ) m) as mine,
      (select rank from ranked where user_id = ${uid}::uuid) as my_rank,
      (select coalesce(json_agg(t order by t.rank asc), '[]'::json) from (
        select rank, user_id::text as user_id, nickname, score, catches, look
        from ranked
        where rank <= ${TOP_LIMIT}
      ) t) as top`);
  const r = rows[0];
  const mine = r?.mine;
  const top: EventLeaderboardRow[] = (r?.top ?? []).map(row => ({
    rank: Number(row.rank),
    userId: row.user_id,
    nickname: row.nickname,
    score: Number(row.score),
    catches: Number(row.catches),
    look: safeLook(row.look),
    me: row.user_id === uid,
  }));
  return {
    eventId: event.id,
    score: mine ? Number(mine.score) : 0,
    bestFishId: mine?.best_fish_id ?? null,
    bestFishScore: mine ? Number(mine.best_fish_score) : 0,
    catches: mine ? Number(mine.catches) : 0,
    dex: parseChampDex(mine?.dex),
    hatsGranted: parseHatsGranted(mine?.hats_granted),
    pendingGold: mine ? Number(mine.pending_gold) : 0,
    pendingFame: mine ? Number(mine.pending_fame) : 0,
    rank: r?.my_rank ?? null,
    top,
  };
}

// ---------- 이벤트 3: 천하제일 행운왕 ----------

type LuckAggregateRow = {
  userId: string;
  nickname: string | null;
  look: ReturnType<typeof safeLook>;
  totalScore: number;
  attendedDays: number;
  firstReachedMs: number;
};

async function computeLuckRankings(
  db: Executor,
  days: readonly string[],
): Promise<LuckAggregateRow[]> {
  if (days.length === 0) return [];
  const { rows } = await db.execute<{
    user_id: string;
    nickname: string | null;
    look: unknown;
    known_score: number;
    attended_days: number;
    first_reached: string;
    null_rows: Array<{ day: string; kind: FortuneKind; index: number }>;
  }>(sql`select
      df.user_id::text as user_id,
      p.nickname,
      sc.data->'look' as look,
      coalesce(sum(df.score), 0)::int as known_score,
      count(*)::int as attended_days,
      ${isoOf('max(df.created_at)')} as first_reached,
      coalesce(json_agg(json_build_object('day', df.day, 'kind', df.kind, 'index', df.index))
        filter (where df.score is null), '[]'::json) as null_rows
    from public.daily_fortunes df
    join auth.users u on u.id = df.user_id and not u.is_anonymous
    left join public.saves_current sc on sc.user_id = df.user_id
    left join public.profiles p on p.user_id = df.user_id
    where df.day = any(${textArray(days)})
      and not coalesce(sc.restricted, false)
    group by df.user_id, p.nickname, sc.data`);

  const entries: LuckAggregateRow[] = rows.map(r => {
    let fallbackSum = 0;
    for (const nr of r.null_rows ?? []) {
      fallbackSum += fortuneScoreOf({ day: nr.day, kind: nr.kind, index: Number(nr.index) as 3 | 5 });
    }
    return {
      userId: r.user_id,
      nickname: r.nickname,
      look: safeLook(r.look),
      totalScore: Number(r.known_score) + fallbackSum,
      attendedDays: Number(r.attended_days),
      firstReachedMs: Date.parse(r.first_reached),
    };
  });

  entries.sort((a, b) =>
    (b.totalScore - a.totalScore)
    || (b.attendedDays - a.attendedDays)
    || (a.firstReachedMs - b.firstReachedMs)
    || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));

  return entries;
}

async function loadDrawState(
  db: Executor,
  uid: string,
  event: LiveEventSummary,
  nowISO: string,
): Promise<EventDrawState> {
  const allDays = eventDaysInRange(event.startsAt, event.endsAt, event.config);
  const currentDay = gameDayOf(nowISO);
  const visibleDays = allDays.filter(d => d <= currentDay);

  const [rankings, myRowsRes, wonRes] = await Promise.all([
    computeLuckRankings(db, visibleDays),
    visibleDays.length > 0
      ? db.execute<{ day: string; kind: FortuneKind; index: number; score: number | null }>(sql`select
          day, kind, index, score
        from public.daily_fortunes
        where user_id = ${uid}::uuid and day = any(${textArray(visibleDays)})`)
      : Promise.resolve({ rows: [] }),
    db.execute<{ won: boolean }>(sql`select exists(
      select 1 from public.event_draws where event_id = ${event.id} and user_id = ${uid}::uuid
    ) as won`),
  ]);

  const byDay = new Map(myRowsRes.rows.map(r => [r.day, r]));
  const days: EventLuckDayStamp[] = visibleDays.map(day => {
    const r = byDay.get(day);
    if (!r) return { day, kind: null, index: null, score: null };
    const index = Number(r.index) as 3 | 5;
    const score = fortuneScoreOf({ day, kind: r.kind, index, score: typeof r.score === 'number' ? r.score : undefined });
    return { day, kind: r.kind, index, score };
  });

  const myIndex = rankings.findIndex(r => r.userId === uid);
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const totalScore = myIndex >= 0
    ? rankings[myIndex].totalScore
    : days.reduce((sum, d) => sum + (d.score ?? 0), 0);
  const attendedDays = myIndex >= 0
    ? rankings[myIndex].attendedDays
    : days.filter(d => d.score !== null).length;

  const top: EventLeaderboardRow[] = rankings.slice(0, TOP_LIMIT).map((row, idx) => ({
    rank: idx + 1,
    userId: row.userId,
    nickname: row.nickname,
    score: row.totalScore,
    look: row.look,
    me: row.userId === uid,
  }));

  return {
    eventId: event.id,
    totalScore,
    attendedDays,
    days,
    rank: myRank,
    top,
    won: Boolean(wonRes.rows[0]?.won),
  };
}

function pickEventForKind(events: readonly LiveEventSummary[], kind: LiveEventKind, nowISO: string): LiveEventSummary | null {
  const nowMs = Date.parse(nowISO);
  const ofKind = events.filter(e => e.kind === kind);
  const active = ofKind.find(e => e.active && Date.parse(e.startsAt) <= nowMs && nowMs < Date.parse(e.endsAt));
  if (active) return active;
  const ended = ofKind.find(e => Date.parse(e.endsAt) <= nowMs);
  return ended ?? null;
}

/** GET /api/events 응답용 전체 스냅샷을 조회한다. 게스트는 활성 요약 목록만 받고 개인·순위·PIN 정보는 숨긴다 */
export async function loadEventsSnapshot(
  db: Executor,
  uid: string | null,
  isGuest: boolean,
  nowISO: string = new Date().toISOString(),
): Promise<EventsSnapshot> {
  const events = await listVisibleLiveEvents(db, nowISO);
  if (!uid || isGuest) {
    return { now: nowISO, events, trio: null, championship: null, draw: null };
  }
  const trioEvent = pickEventForKind(events, 'trio', nowISO);
  const champEvent = pickEventForKind(events, 'championship', nowISO);
  const drawEvent = pickEventForKind(events, 'draw', nowISO);
  const [trio, championship, draw] = await Promise.all([
    trioEvent ? loadTrioState(db, uid, trioEvent) : Promise.resolve(null),
    champEvent ? loadChampionshipState(db, uid, champEvent) : Promise.resolve(null),
    drawEvent ? loadDrawState(db, uid, drawEvent, nowISO) : Promise.resolve(null),
  ]);
  return { now: nowISO, events, trio, championship, draw };
}

/** 계정 정리에서 사용자의 라이브 이벤트 진행·점수·당첨 이력을 모두 지운다 */
export async function deleteUserEventRows(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.event_trio_progress where user_id = ${uid}::uuid`);
  await db.execute(sql`delete from public.event_championship_scores where user_id = ${uid}::uuid`);
  await db.execute(sql`delete from public.event_draws where user_id = ${uid}::uuid`);
}

// ---------- 관리자 라이브 이벤트 CRUD 및 추첨 ----------

export interface EventCreateDraft {
  id: string;
  kind: LiveEventKind;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  config: Record<string, unknown>;
}

export interface EventUpdateDraft {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  config: Record<string, unknown>;
}

function validTrioConfigTargets(raw: unknown): boolean {
  if (raw === undefined) return true;
  if (!Array.isArray(raw) || raw.length !== 3) return false;
  return raw.every(el => {
    if (typeof el !== 'object' || el === null) return false;
    const { fishId, form } = el as { fishId?: unknown; form?: unknown };
    return typeof fishId === 'string' && fishById(fishId) !== undefined && (form === 'normal' || form === 'variant');
  });
}

function parseIso(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function parseEventCreateDraft(raw: unknown): EventCreateDraft | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== 'string' || !EVENT_ID_PATTERN.test(b.id.trim())) return null;
  if (b.kind !== 'trio' && b.kind !== 'championship' && b.kind !== 'draw') return null;
  if (typeof b.title !== 'string') return null;
  const title = b.title.trim();
  if (title.length === 0 || title.length > EVENT_TITLE_MAX) return null;
  if (typeof b.description !== 'string' || b.description.length > EVENT_DESC_MAX) return null;
  const startsAt = parseIso(b.startsAt);
  const endsAt = parseIso(b.endsAt);
  if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return null;
  const active = b.active === undefined ? true : b.active;
  if (typeof active !== 'boolean') return null;
  const config = b.config === undefined ? {} : b.config;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return null;
  if (b.kind === 'trio' && !validTrioConfigTargets((config as Record<string, unknown>).targets)) return null;
  return {
    id: b.id.trim(),
    kind: b.kind,
    title,
    description: b.description.trim(),
    startsAt,
    endsAt,
    active,
    config: config as Record<string, unknown>,
  };
}

export function parseEventUpdateDraft(raw: unknown): EventUpdateDraft | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== 'string' || !EVENT_ID_PATTERN.test(b.id.trim())) return null;
  if (typeof b.title !== 'string') return null;
  const title = b.title.trim();
  if (title.length === 0 || title.length > EVENT_TITLE_MAX) return null;
  if (typeof b.description !== 'string' || b.description.length > EVENT_DESC_MAX) return null;
  const startsAt = parseIso(b.startsAt);
  const endsAt = parseIso(b.endsAt);
  if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return null;
  if (typeof b.active !== 'boolean') return null;
  if (typeof b.config !== 'object' || b.config === null || Array.isArray(b.config)) return null;
  if (!validTrioConfigTargets((b.config as Record<string, unknown>).targets)) return null;
  return {
    id: b.id.trim(),
    title,
    description: b.description.trim(),
    startsAt,
    endsAt,
    active: b.active,
    config: b.config as Record<string, unknown>,
  };
}

/** 관리자용 라이브 이벤트 전체 목록을 조회한다 */
export async function listAdminEvents(db: Executor): Promise<AdminLiveEventRow[]> {
  const { rows } = await db.execute<RawLiveEventRow>(sql`select ${EVENT_COLS}
    from public.live_events
    order by created_at desc, id asc`);
  return rows.map(toAdminRow);
}

/** 관리자용 라이브 이벤트를 생성한다. 이미 있는 id면 'duplicate'다 */
export async function createAdminEvent(
  db: Executor,
  input: EventCreateDraft,
  now: Date = new Date(),
): Promise<AdminLiveEventRow | 'duplicate'> {
  const nowSql = at(now.toISOString());
  const { rows } = await db.execute<RawLiveEventRow>(sql`insert into public.live_events
      (id, kind, title, description, starts_at, ends_at, active, config, created_at, updated_at)
    values (
      ${input.id},
      ${input.kind},
      ${input.title},
      ${input.description},
      ${at(input.startsAt)},
      ${at(input.endsAt)},
      ${input.active},
      ${JSON.stringify(input.config)}::jsonb,
      ${nowSql},
      ${nowSql}
    )
    on conflict (id) do nothing
    returning ${EVENT_COLS}`);
  return rows[0] ? toAdminRow(rows[0]) : 'duplicate';
}

/** 관리자용 라이브 이벤트를 수정한다. 없으면 null이다 */
export async function updateAdminEvent(
  db: Executor,
  input: EventUpdateDraft,
  now: Date = new Date(),
): Promise<AdminLiveEventRow | null> {
  const { rows } = await db.execute<RawLiveEventRow>(sql`update public.live_events
    set
      title = ${input.title},
      description = ${input.description},
      starts_at = ${at(input.startsAt)},
      ends_at = ${at(input.endsAt)},
      active = ${input.active},
      config = ${JSON.stringify(input.config)}::jsonb,
      updated_at = ${at(now.toISOString())}
    where id = ${input.id}
    returning ${EVENT_COLS}`);
  return rows[0] ? toAdminRow(rows[0]) : null;
}

/** 라이브 이벤트를 즉시 마감한다. 시작 전 예약 이벤트도 ends_at > starts_at 제약을 지키며 마감한다. 없으면 null이다 */
export async function endAdminEventNow(
  db: Executor,
  id: string,
  now: Date = new Date(),
): Promise<AdminLiveEventRow | null> {
  const nowSql = at(now.toISOString());
  const { rows } = await db.execute<RawLiveEventRow>(sql`update public.live_events
    set
      starts_at = least(starts_at, ${nowSql} - interval '1 millisecond'),
      ends_at = ${nowSql},
      updated_at = ${nowSql}
    where id = ${id}
    returning ${EVENT_COLS}`);
  return rows[0] ? toAdminRow(rows[0]) : null;
}

/** 라이브 이벤트를 삭제한다. 없으면 false다 */
export async function deleteAdminEvent(db: Executor, id: string): Promise<boolean> {
  const res = await db.execute(sql`delete from public.live_events where id = ${id}`);
  return (res.rowCount ?? 0) > 0;
}

type RawDrawRow = {
  id: number;
  event_id: string;
  user_id: string;
  nickname: string | null;
  reward_kind: 'gold' | 'item' | 'hat' | 'none';
  reward_id: string | null;
  reward_qty: number;
  gold: number;
  reward_pin: string | null;
  reward_expires_at: string | null;
  mail_id: number | null;
  seed: string;
  drawn_by: string | null;
  created_at: string;
};

const toAdminDrawRow = (r: RawDrawRow): AdminEventDrawRow => ({
  id: Number(r.id),
  eventId: r.event_id,
  userId: r.user_id,
  nickname: r.nickname,
  rewardKind: r.reward_kind,
  rewardId: r.reward_id,
  rewardQty: Number(r.reward_qty),
  gold: Number(r.gold),
  rewardPin: r.reward_pin,
  rewardExpiresAt: r.reward_expires_at,
  mailId: r.mail_id === null ? null : Number(r.mail_id),
  seed: r.seed ?? '',
  drawnBy: r.drawn_by ?? null,
  createdAt: r.created_at,
});

/** 특정 이벤트의 추첨·당첨 결과 목록을 조회한다 */
export async function listEventDraws(db: Executor, eventId: string): Promise<AdminEventDrawRow[]> {
  const { rows } = await db.execute<RawDrawRow>(sql`select
      d.id,
      d.event_id,
      d.user_id::text as user_id,
      p.nickname,
      d.reward_kind,
      d.reward_id,
      d.reward_qty,
      d.gold,
      d.reward_pin,
      d.reward_expires_at,
      d.mail_id,
      d.seed,
      d.drawn_by::text as drawn_by,
      ${isoOf('d.created_at')} as created_at
    from public.event_draws d
    left join public.profiles p on p.user_id = d.user_id
    where d.event_id = ${eventId}
    order by d.created_at desc, d.id desc`);
  return rows.map(toAdminDrawRow);
}

export interface EventDrawInput {
  eventId: string;
  count: number;
  rewardKind: 'gold' | 'item' | 'hat' | 'none';
  rewardId: string | null;
  rewardQty: number;
  gold: number;
  rewardPins?: readonly string[];
  rewardExpiresAt?: string | null;
  mailTitle?: string;
  mailBody?: string;
  seed?: string;
  drawnBy?: string | null;
}

export function parseEventDrawInput(raw: unknown): EventDrawInput | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  const eventIdRaw = typeof b.id === 'string' ? b.id : b.eventId;
  if (typeof eventIdRaw !== 'string' || !EVENT_ID_PATTERN.test(eventIdRaw.trim())) return null;
  const eventId = eventIdRaw.trim();

  const count = b.count === undefined ? 1 : b.count;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > 1000) return null;

  const gold = b.gold === undefined ? 0 : b.gold;
  if (typeof gold !== 'number' || !Number.isSafeInteger(gold) || gold < 0 || gold > MAIL_GOLD_MAX) return null;

  const rewardKind = b.rewardKind === undefined ? (gold > 0 ? 'gold' : 'none') : b.rewardKind;
  if (rewardKind !== 'gold' && rewardKind !== 'item' && rewardKind !== 'hat' && rewardKind !== 'none') return null;

  const rewardId = b.rewardId === undefined || b.rewardId === null ? null : b.rewardId;
  if (rewardId !== null && typeof rewardId !== 'string') return null;

  const rewardQty = b.rewardQty === undefined ? (rewardId ? 1 : 0) : b.rewardQty;
  if (typeof rewardQty !== 'number' || !Number.isSafeInteger(rewardQty) || rewardQty < 0) return null;

  if (rewardKind === 'item') {
    if (!rewardId || !isAttachableItemId(rewardId) || rewardQty < 1) return null;
    const amount = itemStorageAmount(rewardId, rewardQty);
    if (amount < 1 || amount > ITEM_CAP) return null;
  } else if (rewardKind === 'hat') {
    if (!rewardId || !hatById(rewardId)) return null;
  }

  let rewardPins: string[] | undefined;
  if (b.rewardPins !== undefined) {
    if (!Array.isArray(b.rewardPins) || !b.rewardPins.every(p => typeof p === 'string' && p.trim().length > 0)) return null;
    rewardPins = (b.rewardPins as string[]).map(p => p.trim());
  } else if (b.rewardPin !== undefined) {
    if (typeof b.rewardPin !== 'string' || b.rewardPin.trim().length === 0) return null;
    rewardPins = [b.rewardPin.trim()];
  }

  let rewardExpiresAt: string | null | undefined;
  if (b.rewardExpiresAt !== undefined) {
    if (b.rewardExpiresAt !== null && typeof b.rewardExpiresAt !== 'string') return null;
    rewardExpiresAt = b.rewardExpiresAt;
  }

  if (b.mailTitle !== undefined && (typeof b.mailTitle !== 'string' || b.mailTitle.trim().length === 0)) return null;
  if (b.mailBody !== undefined && (typeof b.mailBody !== 'string' || b.mailBody.trim().length === 0)) return null;
  if (b.seed !== undefined && (typeof b.seed !== 'string' || b.seed.trim().length === 0)) return null;

  return {
    eventId,
    count,
    rewardKind,
    rewardId,
    rewardQty,
    gold,
    ...(rewardPins ? { rewardPins } : {}),
    ...(rewardExpiresAt !== undefined ? { rewardExpiresAt } : {}),
    ...(typeof b.mailTitle === 'string' ? { mailTitle: b.mailTitle.trim() } : {}),
    ...(typeof b.mailBody === 'string' ? { mailBody: b.mailBody.trim() } : {}),
    ...(typeof b.seed === 'string' ? { seed: b.seed.trim() } : {}),
  };
}

function seededPrng(seed: string): () => number {
  const hash = createHash('sha256').update(seed).digest();
  let state = hash.readUInt32LE(0) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function defaultEventMailBody(
  event: LiveEventSummary,
  pin: string | null,
  expiresAt: string | null,
): string {
  const lines = [`[${event.title}] 이벤트 당첨을 축하드립니다.`];
  if (pin) lines.push(`교환권 번호(PIN): ${pin}`);
  if (expiresAt) lines.push(`유효기간: ${expiresAt}`);
  lines.push('교환권 번호가 타인에게 노출되지 않도록 주의해 주세요.');
  return lines.join('\n');
}

export interface EventDrawOutcome {
  event: AdminLiveEventRow;
  seed: string;
  eligibleCount: number;
  draws: AdminEventDrawRow[];
}

function shuffleWithRng<T>(items: readonly T[], rng: () => number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/**
 * 이벤트 당첨자 무작위 추첨을 실행하고 event_draws 기록 및 인게임 우편(public.mails) 발송을 한 트랜잭션으로 확정한다.
 */
export async function drawEventWinners(
  withTransaction: Database['withTransaction'],
  input: EventDrawInput,
  nowISO: string = new Date().toISOString(),
): Promise<EventDrawOutcome | 'no-event'> {
  return withTransaction(async tx => {
    const { rows: evRows } = await tx.execute<RawLiveEventRow>(sql`select ${EVENT_COLS}
      from public.live_events
      where id = ${input.eventId}
      for update`);
    const evRaw = evRows[0];
    if (!evRaw) return 'no-event';
    const event = toAdminRow(evRaw);

    const trimmedSeed = typeof input.seed === 'string' ? input.seed.trim() : '';
    const seed = trimmedSeed.length > 0 ? trimmedSeed : randomBytes(8).toString('hex');
    const drawnBy = typeof input.drawnBy === 'string' && input.drawnBy.trim().length > 0 ? input.drawnBy.trim() : null;
    const rng = seededPrng(seed);

    let eligibleCount = 0;
    let winners: Array<{ userId: string; nickname: string | null }> = [];
    if (event.kind === 'trio') {
      const { rows } = await tx.execute<{ user_id: string; nickname: string | null }>(sql`select
          p.user_id::text as user_id,
          pr.nickname
        from public.event_trio_progress p
        join auth.users u on u.id = p.user_id and not u.is_anonymous
        left join public.saves_current sc on sc.user_id = p.user_id
        left join public.profiles pr on pr.user_id = p.user_id
        where p.event_id = ${input.eventId}
          and p.completed_at is not null
          and not coalesce(sc.restricted, false)
          and not exists (
            select 1 from public.event_draws d
            where d.event_id = ${input.eventId} and d.user_id = p.user_id
          )
        order by p.completed_at asc, p.user_id asc`);
      const candidates = rows.map(r => ({ userId: r.user_id, nickname: r.nickname }));
      eligibleCount = candidates.length;
      winners = shuffleWithRng(candidates, rng).slice(0, Math.min(input.count, candidates.length));
    } else if (event.kind === 'draw') {
      const allDays = eventDaysInRange(event.startsAt, event.endsAt, event.config);
      const rankings = await computeLuckRankings(tx, allDays);
      const { rows: alreadyRows } = await tx.execute<{ user_id: string }>(sql`select user_id::text as user_id
        from public.event_draws where event_id = ${input.eventId}`);
      const already = new Set(alreadyRows.map(r => r.user_id));
      const remaining = rankings.filter(r => !already.has(r.userId) && r.totalScore > 0);
      eligibleCount = remaining.length;

      // 동점(totalScore, attendedDays) 티어별로 높은 순위부터 순서대로 채우고, 남은 정원보다 큰 티어에서만 시드 PRNG 추첨한다.
      const groups: Array<Array<{ userId: string; nickname: string | null }>> = [];
      let currentScore: number | null = null;
      let currentDays: number | null = null;
      for (const r of remaining) {
        if (
          currentScore === null
          || currentDays === null
          || r.totalScore !== currentScore
          || r.attendedDays !== currentDays
        ) {
          currentScore = r.totalScore;
          currentDays = r.attendedDays;
          groups.push([]);
        }
        groups[groups.length - 1].push({ userId: r.userId, nickname: r.nickname });
      }
      for (const group of groups) {
        if (winners.length >= input.count) break;
        const rem = input.count - winners.length;
        if (group.length <= rem) {
          winners.push(...group);
        } else {
          winners.push(...shuffleWithRng(group, rng).slice(0, rem));
          break;
        }
      }
    } else {
      const { rows } = await tx.execute<{ user_id: string; nickname: string | null }>(sql`select
          s.user_id::text as user_id,
          pr.nickname
        from public.event_championship_scores s
        join auth.users u on u.id = s.user_id and not u.is_anonymous
        left join public.saves_current sc on sc.user_id = s.user_id
        left join public.profiles pr on pr.user_id = s.user_id
        where s.event_id = ${input.eventId}
          and s.score > 0
          and not coalesce(sc.restricted, false)
          and not exists (
            select 1 from public.event_draws d
            where d.event_id = ${input.eventId} and d.user_id = s.user_id
          )
        order by s.score desc, s.updated_at asc, s.user_id asc`);
      const candidates = rows.map(r => ({ userId: r.user_id, nickname: r.nickname }));
      eligibleCount = candidates.length;
      winners = shuffleWithRng(candidates, rng).slice(0, Math.min(input.count, candidates.length));
    }

    const draws: AdminEventDrawRow[] = [];

    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i];
      const explicitPin = input.rewardPins?.[i] ?? (input.rewardPins?.length === 1 && input.count === 1 ? input.rewardPins[0] : undefined);
      const rewardPin = explicitPin
        ?? (event.kind === 'trio' && input.rewardKind === 'none' && input.gold === 0
          ? `PIN-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`
          : null);
      const rewardExpiresAt = input.rewardExpiresAt ?? null;
      const mailItems: MailItemAttachment[] = input.rewardKind === 'item' && input.rewardId && input.rewardQty > 0
        ? [{ id: input.rewardId, qty: input.rewardQty }]
        : [];
      const mailTitle = input.mailTitle ?? `[이벤트 당첨] ${event.title}`;
      const mailBody = input.mailBody ?? defaultEventMailBody(event, rewardPin, rewardExpiresAt);

      const sent = await sendMails(tx, {
        title: mailTitle,
        body: mailBody,
        recipients: [{ userId: winner.userId, gold: input.gold, items: mailItems }],
      }, nowISO);

      let mailId: number | null = null;
      if (sent > 0) {
        const { rows: mailRows } = await tx.execute<{ id: number }>(sql`select id
          from public.mails
          where user_id = ${winner.userId}::uuid and title = ${mailTitle} and created_at = ${at(nowISO)}
          order by id desc
          limit 1`);
        mailId = mailRows[0] ? Number(mailRows[0].id) : null;
      }

      const { rows: insRows } = await tx.execute<RawDrawRow>(sql`insert into public.event_draws (
          event_id, user_id, reward_kind, reward_id, reward_qty, gold, reward_pin, reward_expires_at, mail_id, seed, drawn_by, created_at
        )
        values (
          ${input.eventId},
          ${winner.userId}::uuid,
          ${input.rewardKind},
          ${input.rewardId},
          ${input.rewardQty},
          ${input.gold},
          ${rewardPin},
          ${rewardExpiresAt},
          ${mailId},
          ${seed},
          ${drawnBy}::uuid,
          ${at(nowISO)}
        )
        returning
          id,
          event_id,
          user_id::text as user_id,
          ${winner.nickname}::text as nickname,
          reward_kind,
          reward_id,
          reward_qty,
          gold,
          reward_pin,
          reward_expires_at,
          mail_id,
          seed,
          drawn_by::text as drawn_by,
          ${isoOf('created_at')} as created_at`);
      draws.push(toAdminDrawRow(insRows[0]));
    }

    return { event, seed, eligibleCount, draws };
  });
}
