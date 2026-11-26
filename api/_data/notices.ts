// 기간제 상시 공지(notices) 소유 모듈 — 활성·예정 공지 조회, 관리자 전체 목록 조회, 작성·수정·즉시 마감·삭제.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import type { NoticeItem } from '../../src/game/rules/live.js';
import { at } from './json.js';

export interface AdminNoticeRow extends NoticeItem {
  createdBy: string | null;
  updatedAt: string;
}

export interface NoticeDraftInput {
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
}

type RawNoticeItem = {
  id: string | number;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

type RawAdminNoticeRow = RawNoticeItem & {
  createdBy: string | null;
  updatedAt: string;
};

const isoOf = (column: string) =>
  sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

const toNoticeItem = (r: RawNoticeItem): NoticeItem => ({
  id: Number(r.id),
  title: r.title,
  body: r.body,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  createdAt: r.createdAt,
});

const toAdminNoticeRow = (r: RawAdminNoticeRow): AdminNoticeRow => ({
  ...toNoticeItem(r),
  createdBy: r.createdBy,
  updatedAt: r.updatedAt,
});

/** 아직 마감되지 않은 공지(활성·예정)를 시작 시각 내림차순으로 최대 limit건 돌려준다 */
export async function listUpcomingAndActiveNotices(
  db: Executor,
  now: Date = new Date(),
  limit = 20,
): Promise<NoticeItem[]> {
  const { rows } = await db.execute<RawNoticeItem>(sql`select
      id,
      title,
      body,
      ${isoOf('starts_at')} as "startsAt",
      ${isoOf('ends_at')} as "endsAt",
      ${isoOf('created_at')} as "createdAt"
    from public.notices
    where ends_at > ${at(now.toISOString())}
    order by starts_at desc, id desc
    limit ${limit}`);
  return rows.map(toNoticeItem);
}

/** 관리자용 공지 전체 목록을 최신 생성순으로 돌려준다 */
export async function listAllAdminNotices(db: Executor, limit = 100): Promise<AdminNoticeRow[]> {
  const { rows } = await db.execute<RawAdminNoticeRow>(sql`select
      id,
      title,
      body,
      ${isoOf('starts_at')} as "startsAt",
      ${isoOf('ends_at')} as "endsAt",
      created_by::text as "createdBy",
      ${isoOf('created_at')} as "createdAt",
      ${isoOf('updated_at')} as "updatedAt"
    from public.notices
    order by created_at desc, id desc
    limit ${limit}`);
  return rows.map(toAdminNoticeRow);
}

/** 새 공지를 생성한다 */
export async function createNotice(
  db: Executor,
  input: NoticeDraftInput & { createdBy: string | null },
  now: Date = new Date(),
): Promise<AdminNoticeRow> {
  const nowSql = at(now.toISOString());
  const { rows } = await db.execute<RawAdminNoticeRow>(sql`insert into public.notices
      (title, body, starts_at, ends_at, created_by, created_at, updated_at)
    values (
      ${input.title},
      ${input.body},
      ${at(input.startsAt)},
      ${at(input.endsAt)},
      ${input.createdBy}::uuid,
      ${nowSql},
      ${nowSql}
    )
    returning
      id,
      title,
      body,
      ${isoOf('starts_at')} as "startsAt",
      ${isoOf('ends_at')} as "endsAt",
      created_by::text as "createdBy",
      ${isoOf('created_at')} as "createdAt",
      ${isoOf('updated_at')} as "updatedAt"`);
  return toAdminNoticeRow(rows[0]);
}

/** 기존 공지의 제목·본문·기간을 수정한다. 없으면 null이다 */
export async function updateNotice(
  db: Executor,
  id: number,
  input: NoticeDraftInput,
  now: Date = new Date(),
): Promise<AdminNoticeRow | null> {
  const { rows } = await db.execute<RawAdminNoticeRow>(sql`update public.notices
    set
      title = ${input.title},
      body = ${input.body},
      starts_at = ${at(input.startsAt)},
      ends_at = ${at(input.endsAt)},
      updated_at = ${at(now.toISOString())}
    where id = ${id}
    returning
      id,
      title,
      body,
      ${isoOf('starts_at')} as "startsAt",
      ${isoOf('ends_at')} as "endsAt",
      created_by::text as "createdBy",
      ${isoOf('created_at')} as "createdAt",
      ${isoOf('updated_at')} as "updatedAt"`);
  return rows[0] ? toAdminNoticeRow(rows[0]) : null;
}

/** 공지를 즉시 마감한다. 시작 전 예약 공지도 ends_at > starts_at 제약을 지키며 마감한다. 없으면 null이다 */
export async function endNoticeNow(
  db: Executor,
  id: number,
  now: Date = new Date(),
): Promise<AdminNoticeRow | null> {
  const nowSql = at(now.toISOString());
  const { rows } = await db.execute<RawAdminNoticeRow>(sql`update public.notices
    set
      starts_at = least(starts_at, ${nowSql} - interval '1 millisecond'),
      ends_at = ${nowSql},
      updated_at = ${nowSql}
    where id = ${id}
    returning
      id,
      title,
      body,
      ${isoOf('starts_at')} as "startsAt",
      ${isoOf('ends_at')} as "endsAt",
      created_by::text as "createdBy",
      ${isoOf('created_at')} as "createdAt",
      ${isoOf('updated_at')} as "updatedAt"`);
  return rows[0] ? toAdminNoticeRow(rows[0]) : null;
}

/** 공지를 삭제한다. 존재하지 않으면 false다 */
export async function deleteNotice(db: Executor, id: number): Promise<boolean> {
  const res = await db.execute(sql`delete from public.notices where id = ${id}`);
  return (res.rowCount ?? 0) > 0;
}
