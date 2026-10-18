// 액션 처리에 필요한 읽기 — 표를 가리지 않고 읽기만 한다(쓰기는 표의 소유 모듈이 한다).
// 행은 Postgres JSON 직렬화로 받는다. 시각은 '2030-01-01T00:00:00+00:00' 형식의 문자열, bigint는 수다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { at, textArray } from './json.js';

export type StateRow = {
  data: unknown; version: number; gold: number; fame: number; boat: number; rod: number;
  restricted?: boolean | null; updated_at?: string | null;
};
export type InstanceRow = {
  uid: string; fish_id: string; form: string; size: number | null; caught_at: string | null;
  spot: string | null; judgment: string | null; slot: number | null; locked: boolean | null;
};
export type RecordRow = { fish_id: string; form: string; count: number; max_size: number | null; first_caught: string | null };
export interface BountyRows {
  clears: { kind: string; cleared_at: string }[];
  progress: { quest_id: string; progress: number; started_at: string }[];
  tickets: { quest_id: string; issued_at: string }[];
}

export interface ActionContext {
  nickname: string | null;
  row: StateRow | null;
  /** 개체·도감 — 읽지 않았으면 null */
  instances: InstanceRow[] | null;
  records: RecordRow[] | null;
  /** 수배 행 — 읽지 않았으면 null */
  bounty: BountyRows | null;
}

const INSTANCE_COLS = sql`uid, fish_id, form, size, caught_at, spot, judgment, slot, locked`;
const RECORD_COLS = sql`fish_id, form, count, max_size, first_caught`;

/** 개체·도감 행을 JSON 배열로 읽는 하위 쿼리 */
export const instancesJson = (uid: string) =>
  sql`(select coalesce(json_agg(i), '[]') from (select ${INSTANCE_COLS} from public.fish_instances where user_id = ${uid}) i)`;
export const recordsJson = (uid: string) =>
  sql`(select coalesce(json_agg(r), '[]') from (select ${RECORD_COLS} from public.records where user_id = ${uid}) r)`;
export const stateJson = (uid: string) =>
  sql`(select row_to_json(c) from (select data, version, gold, fame, boat, rod, restricted, updated_at
       from public.saves_current where user_id = ${uid}) c)`;

/**
 * 프로필·저장 상태와, 필요하면 개체·도감·수배 행을 한 번에 읽는다.
 * skipDetailType: 개체·도감 없이 처리할 수 있는 액션인가. 저장 상태가 없거나 다음 버전이 스냅샷 경계면 그래도 읽는다.
 */
export async function loadContext(db: Executor, uid: string, opts: {
  skipDetailType: boolean; snapshotEvery: number; bountyDayStart: string | null;
}): Promise<ActionContext> {
  const wantDetail = sql`not (${opts.skipDetailType} and exists (select 1 from public.saves_current
    where user_id = ${uid} and (version + 1) % ${opts.snapshotEvery} <> 0))`;
  const day = opts.bountyDayStart;
  const { rows } = await db.execute<{
    nickname: string | null; cur: StateRow | null; instances: InstanceRow[] | null; records: RecordRow[] | null;
    clears: BountyRows['clears'] | null; progress: BountyRows['progress'] | null; tickets: BountyRows['tickets'] | null;
  }>(sql`select
    (select nickname from public.profiles where user_id = ${uid}) as nickname,
    ${stateJson(uid)} as cur,
    case when ${wantDetail} then ${instancesJson(uid)} end as instances,
    case when ${wantDetail} then ${recordsJson(uid)} end as records,
    case when ${day !== null} then (select coalesce(json_agg(c), '[]') from (select kind, cleared_at
      from public.bounty_clears where user_id = ${uid} and cleared_at >= ${at(day ?? '1970-01-01T00:00:00Z')}) c) end as clears,
    case when ${day !== null} then (select coalesce(json_agg(p), '[]') from (select quest_id, progress, started_at
      from public.bounty_progress where user_id = ${uid}) p) end as progress,
    case when ${day !== null} then (select coalesce(json_agg(t), '[]') from (select quest_id, issued_at
      from public.bounty_tickets where user_id = ${uid}) t) end as tickets`);
  const r = rows[0];
  return {
    nickname: r.nickname,
    row: r.cur,
    instances: r.instances,
    records: r.records,
    bounty: day !== null ? { clears: r.clears ?? [], progress: r.progress ?? [], tickets: r.tickets ?? [] } : null,
  };
}

/** 정규화 이전 저장(구 saves)의 최신 본문 — 첫 액션 시딩의 원본 */
export async function latestLegacySave(db: Executor, uid: string): Promise<unknown> {
  const { rows } = await db.execute<{ data: unknown }>(sql`select data from public.saves
    where user_id = ${uid} order by updated_at desc limit 1`);
  return rows[0]?.data ?? null;
}

/** 캐치 판정용 — 잡힌 어종·폼의 도감 행과 가방(전시 제외) 개체 수 */
export async function catchLookup(db: Executor, uid: string, fishId: string, form: string): Promise<{
  dex: { count: number; max_size: number | null; first_caught: string | null } | null; bagCount: number;
}> {
  const { rows } = await db.execute<{ dex: { count: number; max_size: number | null; first_caught: string | null } | null; bag: number }>(sql`select
    (select row_to_json(d) from (select count, max_size, first_caught from public.records
      where user_id = ${uid} and fish_id = ${fishId} and form = ${form}) d) as dex,
    (select count(*)::int from public.fish_instances where user_id = ${uid} and slot is null) as bag`);
  return { dex: rows[0].dex, bagCount: rows[0].bag };
}

export type VictimRow = { uid: string; fish_id: string; form: string; size: number | null };

/**
 * 가방이 가득 찼을 때의 방생 후보 — 묶음마다 잠기지 않은 가방 개체 중 가장 덜 특별한 1마리.
 * 첫 묶음은 등록되지 않은 어종(fish_id가 known에 없음), 나머지는 groups의 어종 목록 순서다.
 * 정렬은 폼(normal < variant), 크기(null 먼저), uid 오름차순이다.
 */
export async function evictionCandidates(db: Executor, uid: string, known: readonly string[],
  groups: readonly (readonly string[])[]): Promise<(VictimRow | null)[]> {
  const pick = (g: number, filter: ReturnType<typeof sql>) => sql`(select ${g}::int as g, uid, fish_id, form, size
    from public.fish_instances where user_id = ${uid} and slot is null and locked = false and ${filter}
    order by form asc, size asc nulls first, uid asc limit 1)`;
  const parts = [
    pick(0, sql`fish_id <> all(${textArray(known)})`),
    ...groups.map((ids, i) => pick(i + 1, sql`fish_id = any(${textArray(ids)})`)),
  ];
  const { rows } = await db.execute<VictimRow & { g: number }>(sql.join(parts, sql` union all `));
  return parts.map((_, g) => {
    const row = rows.find(r => r.g === g);
    return row ? { uid: row.uid, fish_id: row.fish_id, form: row.form, size: row.size } : null;
  });
}
