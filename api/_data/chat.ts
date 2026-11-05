// 채팅(chat_messages)과 채팅 신고(chat_reports) 소유 모듈 — 저장, 최근 대화, 신고 복사, 보관 기간 정리, 계정 정리.
// 월드 채팅과 길드 채팅이 같은 표를 쓴다. guild_id가 비어 있으면 월드 채팅, 차 있으면 그 길드의 채팅이다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import type { ChatLine } from '../../src/game/rules/live.js';
import { at } from './json.js';

/** 채팅 메시지 보관 일수. DB 백업 보존 기간과 같다 */
const CHAT_KEEP_DAYS = 30;
/** 신고 기록 보관 일수 */
const REPORT_KEEP_DAYS = 365;
/** 신고할 때 함께 복사하는 앞뒤 대화 수(한쪽) */
const REPORT_CONTEXT = 5;

type RawLine = { id: string | number; uid: string; nick: string; text: string; at: string };

const toLine = (r: RawLine): ChatLine => ({ id: Number(r.id), uid: r.uid, nick: r.nick, text: r.text, at: r.at });

// ChatLine의 at 형식(밀리초까지의 UTC ISO 문자열)
const isoOf = (column: string) =>
  sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

// 그 방의 메시지만 고르는 조건 — 월드(guild_id 없음) 또는 그 길드
const roomOf = (column: string, guildId: string | null) =>
  guildId === null ? sql`${sql.raw(column)} is null` : sql`${sql.raw(column)} = ${guildId}`;

/**
 * 메시지를 저장하고 보낼 줄을 돌려준다. 제재된 계정(saves_current.restricted)이면 저장하지 않고 null이다.
 * 길드 채팅(guildId)은 지금 그 길드원일 때만 저장하고, 아니면 null이다.
 * 제재와 길드 탈퇴는 연결 중에도 바뀌므로 저장 문장에서 함께 판정한다.
 */
export async function saveChat(db: Executor, uid: string, nick: string, text: string, guildId: string | null = null): Promise<ChatLine | null> {
  const member = guildId === null ? sql`true` : sql`exists (select 1 from public.guild_members g
    where g.guild_id = ${guildId} and g.user_id = ${uid} and g.left_at is null)`;
  const { rows } = await db.execute<RawLine>(sql`insert into public.chat_messages (user_id, nick, text, guild_id)
    select ${uid}, ${nick}, ${text}, ${guildId}::uuid
    where not exists (select 1 from public.saves_current c where c.user_id = ${uid} and c.restricted) and ${member}
    returning id, user_id::text as uid, nick, text, ${isoOf('created_at')} as at`);
  return rows[0] ? toLine(rows[0]) : null;
}

/** 그 방(월드 또는 길드)의 최근 대화 limit개를 오래된 순으로. 그 사용자가 차단한 사람의 메시지는 뺀다 */
export async function recentChat(db: Executor, uid: string, limit: number, guildId: string | null = null): Promise<ChatLine[]> {
  const { rows } = await db.execute<RawLine>(sql`select * from (
      select m.id, m.user_id::text as uid, m.nick, m.text, ${isoOf('m.created_at')} as at
      from public.chat_messages m
      where ${roomOf('m.guild_id', guildId)} and not exists (select 1 from public.blocks b where b.user_id = ${uid} and b.blocked_id = m.user_id)
      order by m.id desc
      limit ${limit}
    ) t order by t.id`);
  return rows.map(toLine);
}

/**
 * 메시지를 신고한다. 그 메시지와 같은 방(월드 또는 그 길드)의 앞뒤 대화를 신고 표에 복사한다. 같은 사람이 같은 메시지를 다시 신고하면 그대로 둔다.
 * @returns 메시지가 없으면(보관 기간이 지나 지워졌거나 잘못된 id) false
 */
export async function reportChat(db: Executor, uid: string, messageId: number, nowISO: string): Promise<boolean> {
  const { rows } = await db.execute<{ found: number }>(sql`with target as (
      select id, user_id, guild_id from public.chat_messages where id = ${messageId}
    ), context as (
      (select m.* from public.chat_messages m, target t where m.id <= t.id and m.guild_id is not distinct from t.guild_id
        order by m.id desc limit ${REPORT_CONTEXT + 1})
      union all
      (select m.* from public.chat_messages m, target t where m.id > t.id and m.guild_id is not distinct from t.guild_id
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
