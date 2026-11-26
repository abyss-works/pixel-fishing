// 채팅(chat_messages)과 채팅 신고(chat_reports) 소유 모듈 — 저장, 방별 최근 대화, 신고 복사, 보관 기간 정리, 계정 정리.
// 전체(global)·지역(local)·길드(guild) 채팅이 같은 표를 쓴다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { CHAT_RECENT } from '../../src/game/rules/live.js';
import type { ChatLine, ChatRoom } from '../../src/game/rules/live.js';
import { at, uuidArray } from './json.js';

/** 채팅 메시지 보관 일수. DB 백업 보존 기간과 같다 */
const CHAT_KEEP_DAYS = 30;
/** 신고 기록 보관 일수 */
const REPORT_KEEP_DAYS = 365;
/** 신고할 때 함께 복사하는 앞뒤 대화 수(한쪽) */
const REPORT_CONTEXT = 5;

type RawLine = { id: string | number; uid: string; nick: string; text: string; at: string };

export interface SaveChatInput {
  uid: string;
  nick: string;
  text: string;
  room?: ChatRoom;
  region?: string | null;
  guildId?: string | null;
}

export type SaveChatResult =
  | { ok: true; line: ChatLine; room: ChatRoom; region: string | null; guild: string | null }
  | { ok: false; code: 'chat-restricted' | 'chat-no-guild' };

const toLine = (r: RawLine): ChatLine => ({ id: Number(r.id), uid: r.uid, nick: r.nick, text: r.text, at: r.at });

// ChatLine의 at 형식(밀리초까지의 UTC ISO 문자열)
const isoOf = (column: string) =>
  sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

const blockedFilter = (blockedOrUid: string | readonly string[]): SQL => {
  if (typeof blockedOrUid === 'string') {
    return sql`not exists (select 1 from public.blocks b where b.user_id = ${blockedOrUid} and b.blocked_id = m.user_id)`;
  }
  return blockedOrUid.length === 0 ? sql`true` : sql`not (m.user_id = any(${uuidArray(blockedOrUid)}))`;
};

async function queryRecent(db: Executor, roomFilter: SQL, blockedOrUid: string | readonly string[], limit: number): Promise<ChatLine[]> {
  const { rows } = await db.execute<RawLine>(sql`select * from (
      select m.id, m.user_id::text as uid, m.nick, m.text, ${isoOf('m.created_at')} as at
      from public.chat_messages m
      where ${roomFilter} and ${blockedFilter(blockedOrUid)}
      order by m.id desc
      limit ${limit}
    ) t order by t.id`);
  return rows.map(toLine);
}

/**
 * 메시지를 저장하고 결과(줄·방·지역·길드)를 돌려준다.
 * 제재된 계정(saves_current.restricted)은 chat-restricted, 길드 방에서 길드원이 아니면 chat-no-guild를 돌려준다.
 */
export async function saveChat(db: Executor, input: SaveChatInput): Promise<SaveChatResult>;
export async function saveChat(db: Executor, uid: string, nick: string, text: string, guildId?: string | null): Promise<ChatLine | null>;
export async function saveChat(
  db: Executor,
  inputOrUid: SaveChatInput | string,
  nickArg?: string,
  textArg?: string,
  guildArg: string | null = null,
): Promise<SaveChatResult | ChatLine | null> {
  const legacy = typeof inputOrUid === 'string';
  const input: SaveChatInput = legacy
    ? {
      uid: inputOrUid,
      nick: nickArg ?? '',
      text: textArg ?? '',
      room: guildArg !== null ? 'guild' : 'global',
      region: null,
      guildId: guildArg,
    }
    : inputOrUid;
  const room: ChatRoom = input.room ?? 'local';
  const dbGuildId = room === 'guild' ? (input.guildId ?? null) : null;
  const dbRegion = room === 'local' ? (input.region ?? null) : null;

  if (room === 'guild' && !dbGuildId) {
    return legacy ? null : { ok: false, code: 'chat-no-guild' };
  }

  const member = room === 'guild'
    ? sql`exists (select 1 from public.guild_members g
      where g.guild_id = ${dbGuildId}::uuid and g.user_id = ${input.uid} and g.left_at is null)`
    : sql`true`;

  type SaveRow = {
    restricted: boolean;
    member: boolean;
    id: string | number | null;
    uid: string | null;
    nick: string | null;
    text: string | null;
    at: string | null;
  };

  const { rows } = await db.execute<SaveRow>(sql`with check_user as (
      select
        exists (select 1 from public.saves_current c where c.user_id = ${input.uid} and c.restricted) as restricted,
        ${member} as member
    ), inserted as (
      insert into public.chat_messages (user_id, nick, text, channel, region, guild_id)
      select ${input.uid}, ${input.nick}, ${input.text}, ${room}, ${dbRegion}, ${dbGuildId}::uuid
      from check_user
      where not restricted and member
      returning id, user_id::text as uid, nick, text, ${isoOf('created_at')} as at
    )
    select
      (select restricted from check_user) as restricted,
      (select member from check_user) as member,
      i.id, i.uid, i.nick, i.text, i.at
    from (select 1) dummy
    left join inserted i on true`);

  const row = rows[0];
  let result: SaveChatResult;
  if (!row || row.restricted) {
    result = { ok: false, code: 'chat-restricted' };
  } else if (!row.member || row.id === null || row.uid === null || row.nick === null || row.text === null || row.at === null) {
    result = { ok: false, code: 'chat-no-guild' };
  } else {
    result = {
      ok: true,
      line: toLine({ id: row.id, uid: row.uid, nick: row.nick, text: row.text, at: row.at }),
      room,
      region: dbRegion,
      guild: dbGuildId,
    };
  }
  return legacy ? (result.ok ? result.line : null) : result;
}

/** 전체(global) 방의 최근 대화를 오래된 순으로 돌려준다. 차단한 사람의 메시지는 뺀다 */
export async function recentChat(db: Executor, blocked: readonly string[], limit?: number): Promise<ChatLine[]>;
export async function recentChat(db: Executor, uid: string, limit?: number, guildId?: string | null): Promise<ChatLine[]>;
export async function recentChat(
  db: Executor,
  blockedOrUid: readonly string[] | string,
  limit = CHAT_RECENT,
  guildId: string | null = null,
): Promise<ChatLine[]> {
  if (typeof blockedOrUid === 'string' && guildId !== null) {
    return recentGuildChat(db, guildId, blockedOrUid, limit);
  }
  return queryRecent(db, sql`m.channel = 'global'`, blockedOrUid, limit);
}

/** 지역(local) 방의 최근 대화를 오래된 순으로 돌려준다. 차단한 사람의 메시지는 뺀다 */
export function recentLocalChat(
  db: Executor,
  region: string,
  blocked: readonly string[] | string = [],
  limit = CHAT_RECENT,
): Promise<ChatLine[]> {
  return queryRecent(db, sql`m.channel = 'local' and m.region = ${region}`, blocked, limit);
}

/** 길드(guild) 방의 최근 대화를 오래된 순으로 돌려준다. 차단한 사람의 메시지는 뺀다 */
export function recentGuildChat(
  db: Executor,
  guildId: string,
  blocked: readonly string[] | string = [],
  limit = CHAT_RECENT,
): Promise<ChatLine[]> {
  return queryRecent(db, sql`m.channel = 'guild' and m.guild_id = ${guildId}::uuid`, blocked, limit);
}

/**
 * 메시지를 신고한다. 그 메시지와 같은 방(전체·같은 최상위 지역·같은 길드)의 앞뒤 대화를 신고 표에 복사한다.
 * 같은 사람이 같은 메시지를 다시 신고하면 그대로 둔다.
 * @returns 메시지가 없으면(보관 기간이 지나 지워졌거나 잘못된 id) false
 */
export async function reportChat(db: Executor, uid: string, messageId: number, nowISO: string): Promise<boolean> {
  const { rows } = await db.execute<{ found: number }>(sql`with target as (
      select id, user_id, channel, guild_id, region from public.chat_messages where id = ${messageId}
    ), context as (
      (select m.* from public.chat_messages m, target t
        where m.id <= t.id
          and m.channel = t.channel
          and m.guild_id is not distinct from t.guild_id
          and m.region is not distinct from t.region
        order by m.id desc limit ${REPORT_CONTEXT + 1})
      union all
      (select m.* from public.chat_messages m, target t
        where m.id > t.id
          and m.channel = t.channel
          and m.guild_id is not distinct from t.guild_id
          and m.region is not distinct from t.region
        order by m.id limit ${REPORT_CONTEXT})
    ), saved as (
      insert into public.chat_reports (user_id, message_id, target_id, lines, created_at)
      select ${uid}, t.id, t.user_id,
        (select jsonb_agg(jsonb_build_object('id', c.id, 'uid', c.user_id::text, 'nick', c.nick, 'text', c.text,
          'at', ${isoOf('c.created_at')}) order by c.id) from context c),
        ${at(nowISO)}
      from target t
      on conflict (user_id, message_id) do nothing
    )
    select count(*)::int as found from target`);
  return rows[0].found > 0;
}

/** 보관 기간이 지난 메시지(30일)와 신고 기록(1년)을 지운다 */
export async function deleteExpiredChat(db: Executor, nowISO: string): Promise<{ messages: number; reports: number }> {
  const messages = await db.execute(sql`delete from public.chat_messages
    where created_at < ${at(nowISO)} - make_interval(days => ${CHAT_KEEP_DAYS}::int)`);
  const reports = await db.execute(sql`delete from public.chat_reports
    where created_at < ${at(nowISO)} - make_interval(days => ${REPORT_KEEP_DAYS}::int)`);
  return { messages: messages.rowCount ?? 0, reports: reports.rowCount ?? 0 };
}

/** 계정 정리에서 그 사용자가 보낸 메시지와 그 사용자가 낸 신고를 지운다. 남이 낸 신고의 복사본은 남는다 */
export async function deleteUserChat(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.chat_messages where user_id = ${uid}`);
  await db.execute(sql`delete from public.chat_reports where user_id = ${uid}`);
}
