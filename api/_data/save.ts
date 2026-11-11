// 저장 표(saves_current·fish_instances·records·saves) 쓰기 소유 모듈.
// 저장 3분할(0006): saves_current(스칼라+blob, 낙관 락) · fish_instances(개체) · records(도감).
// saves는 정규화 이전 세이브와 주기 스냅샷을 담는 append-only 아카이브다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database, Executor } from '../_db/client.js';
import type { FishInstance, GameState } from '../../src/game/rules/logic.js';
import type { StateWrites } from '../../src/game/rules/actions.js';
import { at, jsonParam, uuidArray } from './json.js';

/** GameState → saves_current 한 행. 스칼라는 열, 나머지만 blob */
export function stateRow(state: GameState) {
  const { bag: _b, exhibit: _e, dex: _d, gold, fame, boat, rod, ...rest } = state;
  return { gold, fame, boat, rod, data: rest };
}

/** 저장 blob의 버전이 없는 구 행이 가정하는 버전. 스칼라 열이 분리된 뒤부터 blob에는 항상 버전이 들어간다 */
const UNVERSIONED_BLOB = 8;

/**
 * saves_current 행의 blob → migrate 입력. blob이 가진 버전을 그대로 따른다.
 * 버전을 고정해 넣으면 이미 이관된 세이브가 이관 링크를 다시 지나 영수증과 조리 상태가 사라진다.
 */
export function blobInput(data: unknown): object {
  return { v: UNVERSIONED_BLOB, ...(data as object) };
}

/** 개체 → DB 행 */
export function instRow(uid: string, i: FishInstance, slot: number | null) {
  return {
    uid: i.uid, user_id: uid, fish_id: i.fishId, form: i.form,
    size: i.size, caught_at: i.caughtAt, spot: i.spot, judgment: i.judgment, slot,
    locked: i.locked,
  };
}

const INSTANCE_RECORDSET = sql`(uid uuid, user_id uuid, fish_id text, form text, size real, caught_at timestamptz,
  spot text, judgment text, slot int, locked boolean)`;

function insertInstances(guard: SQL, rows: ReturnType<typeof instRow>[]): SQL {
  return sql`insert into public.fish_instances (uid, user_id, fish_id, form, size, caught_at, spot, judgment, slot, locked)
    select uid, user_id, fish_id, form, size, caught_at, spot, judgment, slot, coalesce(locked, false)
    from json_to_recordset(${jsonParam(rows)}) as x${INSTANCE_RECORDSET} where ${guard}`;
}

/** 이미 있는 본인 개체를 새 값으로 바꾼다 */
function replaceInstances(guard: SQL, uid: string, rows: ReturnType<typeof instRow>[]): SQL {
  return sql`update public.fish_instances f set fish_id = x.fish_id, form = x.form, size = x.size, caught_at = x.caught_at,
      spot = x.spot, judgment = x.judgment, slot = x.slot, locked = coalesce(x.locked, false)
    from json_to_recordset(${jsonParam(rows)}) as x${INSTANCE_RECORDSET}
    where f.user_id = ${uid} and f.uid = x.uid and ${guard}`;
}

function upsertRecords(guard: SQL, uid: string, records: StateWrites['records'], nowISO: string): SQL {
  const rows = records.map(r => ({
    fish_id: r.fishId, form: r.form, count: r.rec.count, max_size: r.rec.maxSize, first_caught: r.rec.first,
  }));
  return sql`insert into public.records (user_id, fish_id, form, count, max_size, first_caught, updated_at)
    select ${uid}, fish_id, form, count, max_size, first_caught, ${at(nowISO)}
    from json_to_recordset(${jsonParam(rows)}) as x(fish_id text, form text, count bigint, max_size real, first_caught timestamptz)
    where ${guard}
    on conflict (user_id, fish_id, form) do update set count = excluded.count, max_size = excluded.max_size,
      first_caught = excluded.first_caught, updated_at = excluded.updated_at`;
}

/** 확정과 함께 남기는 접속 표시 — catch는 캐치 시각을, boot는 활성 창을 바꾼다. 없으면 그대로 둔다 */
export interface CommitMarks {
  lastCatchAt?: string;
  activeClient?: string | null;
}

/**
 * 액션 밖에서 골드를 빼는 문장(길드 보너스 기부). 저장 버전을 올려, 그 전에 상태를 읽은 액션이 낙관 락에서 거부되게 한다.
 * 액션 페이싱 기준(updated_at)은 바꾸지 않는다. 호출자는 같은 트랜잭션에서 행을 잠그고 골드를 확인한 뒤 실행한다.
 */
export function goldDebit(uid: string, gold: number): SQL {
  return sql`update public.saves_current set gold = gold - ${gold}, version = version + 1 where user_id = ${uid}`;
}

/** 낙관 락 갱신 — 읽은 version 그대로일 때만 바뀐다. 핵심 쓰기의 첫 조각이며 다른 조각의 guard가 된다 */
export function versionUpdate(uid: string, state: GameState, readVersion: number, nowISO: string, marks: CommitMarks = {}): SQL {
  const r = stateRow(state);
  const lastCatch = marks.lastCatchAt === undefined ? sql`` : sql`, last_catch_at = ${at(marks.lastCatchAt)}`;
  const client = marks.activeClient === undefined ? sql`` : sql`, active_client = ${marks.activeClient}`;
  return sql`update public.saves_current set gold = ${r.gold}, fame = ${r.fame}, boat = ${r.boat}, rod = ${r.rod},
    data = ${JSON.stringify(r.data)}::jsonb, version = ${readVersion + 1}, updated_at = ${at(nowISO)}${lastCatch}${client}
    where user_id = ${uid} and version = ${readVersion} returning user_id`;
}

/**
 * 리듀서가 전후 비교로 뽑은 개체·도감 변경분을 조각으로 만든다(재계산하지 않는다).
 * 같은 uid를 지우고 다시 넣는 경우(가져오기)는 지우지 않고 새 값으로 바꾼다 — 한 문장에서 같은 행을 두 번 바꾸지 않는다.
 */
export function writeFragments(guard: SQL, uid: string, w: StateWrites, nowISO: string): SQL[] {
  const out: SQL[] = [];
  const removedSet = new Set(w.instancesRemoved);
  const rows = w.instancesAdded.map(({ inst, slot }) => instRow(uid, inst, slot));
  const fresh = rows.filter(r => !removedSet.has(r.uid));
  const replaced = rows.filter(r => removedSet.has(r.uid));
  if (fresh.length > 0) out.push(insertInstances(guard, fresh));
  if (replaced.length > 0) out.push(replaceInstances(guard, uid, replaced));
  const added = new Set(rows.map(r => r.uid));
  const removed = w.instancesRemoved.filter(u => !added.has(u));
  if (removed.length > 0) {
    out.push(sql`delete from public.fish_instances where user_id = ${uid} and uid = any(${uuidArray(removed)}) and ${guard}`);
  }
  if (w.instancesMoved.length > 0) {
    out.push(sql`update public.fish_instances f set slot = m.slot
      from json_to_recordset(${jsonParam(w.instancesMoved)}) as m(uid uuid, slot int)
      where f.user_id = ${uid} and f.uid = m.uid and ${guard}`);
  }
  for (const locked of [true, false]) {
    const uids = w.instancesLocked.filter(l => l.locked === locked).map(l => l.uid);
    if (uids.length > 0) {
      out.push(sql`update public.fish_instances set locked = ${locked}
        where user_id = ${uid} and uid = any(${uuidArray(uids)}) and ${guard}`);
    }
  }
  if (w.records.length > 0) out.push(upsertRecords(guard, uid, w.records, nowISO));
  return out;
}

/**
 * 첫 액션 시딩 — 저장 상태 행(버전 1)과 개체·도감을 한 트랜잭션으로 만든다.
 * 다른 요청이 먼저 시딩했으면 아무것도 쓰지 않고 false를 돌려준다.
 */
export async function seedState(withTransaction: Database['withTransaction'], uid: string, seed: GameState, nowISO: string): Promise<boolean> {
  return withTransaction(async tx => {
    const r = stateRow(seed);
    const { rows } = await tx.execute(sql`insert into public.saves_current (user_id, version, gold, fame, boat, rod, data)
      values (${uid}, 1, ${r.gold}, ${r.fame}, ${r.boat}, ${r.rod}, ${JSON.stringify(r.data)}::jsonb)
      on conflict (user_id) do nothing returning user_id`);
    if (rows.length === 0) return false;
    const always = sql`true`;
    const writes: StateWrites = {
      instancesAdded: seed.bag.map(inst => ({ inst, slot: null })),
      instancesRemoved: [], instancesMoved: [], instancesLocked: [],
      records: Object.entries(seed.dex).flatMap(([fishId, forms]) =>
        Object.entries(forms).flatMap(([form, rec]) => (rec ? [{ fishId, form: form as FishInstance['form'], rec }] : []))),
    };
    for (const part of writeFragments(always, uid, writes, nowISO)) await tx.execute(part);
    return true;
  });
}

/** 주기 스냅샷 — 응답 뒤 후속 쓰기다 */
export function snapshotInsert(uid: string, state: GameState, nowISO: string): SQL {
  return sql`insert into public.saves (user_id, data, updated_at) values (${uid}, ${JSON.stringify(state)}::jsonb, ${at(nowISO)})`;
}

/** 콜드 아카이브 — saves 메타 한 묶음. (user_id 오름차순, updated_at 내림차순) 순서 계약이다 */
export async function savesMetaPage(db: Executor, limit: number, offset: number): Promise<{ id: number; user_id: string; updated_at: string }[]> {
  const { rows } = await db.execute<{ page: { id: number; user_id: string; updated_at: string }[] }>(sql`select coalesce(json_agg(s), '[]') as page
    from (select id, user_id, updated_at from public.saves order by user_id, updated_at desc limit ${limit} offset ${offset}) s`);
  return rows[0].page;
}

/** 콜드 아카이브 — id로 saves 본문을 읽는다. 행은 Postgres JSON 직렬화 그대로다 */
export async function savesByIds(db: Executor, ids: readonly number[]): Promise<Record<string, unknown>[]> {
  const { rows } = await db.execute<{ page: Record<string, unknown>[] }>(sql`select coalesce(json_agg(s), '[]') as page
    from (select * from public.saves where id = any(${idArray(ids)})) s`);
  return rows[0].page;
}

/** 콜드 아카이브 — 옮긴 saves 행을 지운다 */
export async function deleteSavesByIds(db: Executor, ids: readonly number[]): Promise<void> {
  await db.execute(sql`delete from public.saves where id = any(${idArray(ids)})`);
}

/** 계정 정리에서 사용자의 개체·도감·스냅샷과 저장 상태 행을 모두 지운다. 저장 상태 행은 마지막에 지운다 */
export async function deleteUserSaves(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.fish_instances where user_id = ${uid}`);
  await db.execute(sql`delete from public.records where user_id = ${uid}`);
  await db.execute(sql`delete from public.saves where user_id = ${uid}`);
  await db.execute(sql`delete from public.saves_current where user_id = ${uid}`);
}

const idArray = (ids: readonly number[]) => sql`${`{${ids.map(Number).join(',')}}`}::bigint[]`;

/** 저장 상태의 제재 여부를 바꾼다. 저장 상태가 없으면 바꾸지 않고 false를 돌려준다 */
export async function setRestricted(db: Executor, uid: string, restricted: boolean): Promise<boolean> {
  const result = await db.execute(sql`update public.saves_current set restricted = ${restricted} where user_id = ${uid}`);
  return (result.rowCount ?? 0) > 0;
}
