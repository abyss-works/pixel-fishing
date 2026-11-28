// 액션 이벤트(events) 쓰기 소유 모듈 — append-only 정본 스트림. 유실을 허용하는 후속 쓰기다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import type { GameEvent } from '../../src/game/rules/actions.js';
import type { AwayEvent } from '../../src/game/rules/away.js';
import { CATCH_EVENT_TYPES } from '../../src/game/rules/catchPipeline.js';
import { at, jsonParam, textArray } from './json.js';

export { CATCH_EVENT_TYPES };

/** 감사 이벤트가 포획(신규 'catch' + 구형 'eventCatch' 하위호환)인지 판별하는 SQL 조건 */
export function isCatchEventSql(column: SQL = sql`type`): SQL {
  return sql`${column} = any(${textArray(CATCH_EVENT_TYPES)})`;
}

/** 감사 이벤트가 일반 해역 포획인지 판별하는 SQL 조건(이벤트 구역 제외) */
export function isRegularCatchEventSql(typeCol: SQL = sql`type`, payloadCol: SQL = sql`payload`): SQL {
  return sql`${typeCol} = 'catch' and coalesce(${payloadCol}->>'mode', 'regular') = 'regular' and coalesce(${payloadCol}->>'spot', '') <> 'championship'`;
}

export function eventsInsert(
  uid: string,
  events: readonly GameEvent[],
  createdAtISO: string,
  counted = false,
  catchWeighting: number | null = null,
): SQL | null {
  if (events.length === 0) return null;
  const rows = events.map(e => ({
    type: e.type,
    payload: e.payload,
    weighting: catchWeighting !== null && (e.type === 'catch' || e.type === 'eventCatch') ? catchWeighting : null,
  }));
  return sql`insert into public.events (user_id, type, payload, created_at, counted, weighting)
    select ${uid}, type, payload, ${at(createdAtISO)}, ${counted}, weighting
    from json_to_recordset(${jsonParam(rows)}) as x(type text, payload jsonb, weighting float8)`;
}

export interface EventArchiveRow {
  id: number;
  user_id: string;
  type: string;
  payload: unknown;
  created_at: string;
  counted: boolean;
}

/** 콜드 아카이브 — 컷오프 이전 이벤트를 id 오름차순으로 한 묶음. 행은 Postgres JSON 직렬화 그대로다 */
export async function eventsBefore(db: Executor, cutoffISO: string, afterId: number, limit: number): Promise<EventArchiveRow[]> {
  const { rows } = await db.execute<{ page: EventArchiveRow[] }>(sql`select coalesce(json_agg(e order by e.id), '[]') as page
    from (select id, user_id, type, payload, created_at, counted from public.events
      where created_at < ${at(cutoffISO)} and id > ${afterId} order by id limit ${limit}) e`);
  return rows[0].page;
}

/** 콜드 아카이브 — 컷오프 이전 이벤트 수(기록용) */
export async function countEventsBefore(db: Executor, cutoffISO: string): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from public.events where created_at < ${at(cutoffISO)}`);
  return rows[0].n;
}

/** 콜드 아카이브 — 옮긴 범위의 이벤트를 지우고 지운 행 수를 돌려준다 */
export async function deleteEventsUpTo(db: Executor, maxId: number, cutoffISO: string): Promise<number> {
  const result = await db.execute(sql`delete from public.events where id <= ${maxId} and created_at < ${at(cutoffISO)}`);
  return result.rowCount ?? 0;
}

/** 계정 정리에서 사용자의 이벤트를 모두 지운다 */
export async function deleteUserEvents(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.events where user_id = ${uid}`);
}

/** 관리자 조치의 이벤트 유형. 제재, 제재 해제, 비밀번호 재설정 링크 발급, 세션 강제 종료다 */
export type AdminActionType = 'adminRestrict' | 'adminUnrestrict' | 'adminResetLink' | 'adminRevokeSessions';

/** 관리자 조치를 대상 사용자의 이벤트로 남긴다. 조치한 관리자 id는 payload.adminId다 */
export async function recordAdminAction(db: Executor, uid: string, type: AdminActionType, adminId: string,
  detail: Record<string, unknown> = {}): Promise<void> {
  await db.execute(sql`insert into public.events (user_id, type, payload)
    values (${uid}, ${type}, ${JSON.stringify({ adminId, ...detail })}::jsonb)`);
}

/** 방치 결과 보고 — 기간 안의 일반 해역 캐치·자동 방생·자동 기운 얻기·일괄 소모 요약 이벤트를 시각 순서로. 이벤트 구역 포획은 제외한다 */
export async function awayEvents(db: Executor, uid: string, fromISO: string, toISO: string): Promise<AwayEvent[]> {
  const { rows } = await db.execute<{ events: AwayEvent[] }>(sql`select coalesce(json_agg(json_build_object(
      'type', e.type, 'payload', e.payload, 'at', e.created_at) order by e.created_at, e.id), '[]') as events
    from public.events e
    where e.user_id = ${uid}
      and (
        ${isRegularCatchEventSql(sql`e.type`, sql`e.payload`)}
        or e.type in ('autoRelease', 'autoExtractEnergy', 'awaySettle')
      )
      and e.created_at >= ${at(fromISO)} and e.created_at <= ${at(toISO)}`);
  return rows[0].events;
}
