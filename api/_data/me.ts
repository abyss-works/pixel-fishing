// 본인 읽기 — 사용자 자신의 표 행을 표시용으로 읽는다. 행 모양은 각 표의 열 이름 그대로다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { at } from './json.js';
import type { BountyRows, InstanceRow, RecordRow } from './load.js';
import { instancesJson, latestLegacySave, recordsJson } from './load.js';

export interface OwnState {
  cur: { data: unknown; gold: number; fame: number; boat: number; rod: number; version: number } | null;
  instances: InstanceRow[];
  records: RecordRow[];
  /** 저장 상태가 없을 때만 구 저장의 최신 본문. 없으면 null */
  legacy: unknown;
}

export async function readOwnState(db: Executor, uid: string): Promise<OwnState> {
  const { rows } = await db.execute<{ cur: OwnState['cur']; instances: InstanceRow[]; records: RecordRow[] }>(sql`select
    (select row_to_json(c) from (select data, gold, fame, boat, rod, version
      from public.saves_current where user_id = ${uid}) c) as cur,
    ${instancesJson(uid)} as instances,
    ${recordsJson(uid)} as records`);
  const r = rows[0];
  return { cur: r.cur, instances: r.instances, records: r.records, legacy: r.cur ? null : await latestLegacySave(db, uid) };
}

/** dayStart 이후의 클리어와 진행·도전권 전부. 날이 바뀌어 만료된 의뢰는 읽는 쪽이 거른다 */
export async function readOwnBounty(db: Executor, uid: string, dayStart: string): Promise<BountyRows> {
  const { rows } = await db.execute<BountyRows & Record<string, unknown>>(sql`select
    (select coalesce(json_agg(c), '[]') from (select kind, cleared_at
      from public.bounty_clears where user_id = ${uid} and cleared_at >= ${at(dayStart)}) c) as clears,
    (select coalesce(json_agg(p), '[]') from (select quest_id, progress, started_at
      from public.bounty_progress where user_id = ${uid}) p) as progress,
    (select coalesce(json_agg(t), '[]') from (select quest_id, issued_at
      from public.bounty_tickets where user_id = ${uid}) t) as tickets`);
  return rows[0];
}

export async function readOwnProfile(db: Executor, uid: string): Promise<{ nickname: string | null }> {
  const { rows } = await db.execute<{ nickname: string }>(sql`select nickname from public.profiles where user_id = ${uid}`);
  return { nickname: rows[0]?.nickname ?? null };
}
