// 우편(mails) 소유 모듈 — 운영자가 플레이어에게 보내는 제목·본문·골드.
// 플레이어 쪽은 목록·읽음과 골드 받기 확정 조각, 운영 쪽은 보내기 미리보기와 보내기를 맡는다.
// 보내기는 관리자 서버 함수와 운영 스크립트가 같은 함수를 쓴다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { at, jsonParam } from './json.js';

export const MAIL_TITLE_MAX = 60;
export const MAIL_BODY_MAX = 2000;
/** 한 통에 붙일 수 있는 골드 상한 — 입력 실수(자릿수)를 막는 상한일 뿐 밸런스 값이 아니다 */
export const MAIL_GOLD_MAX = 1_000_000_000;
/** 목록 상한 — 할 일이 끝난 우편은 최근 순으로 이만큼만 돌려준다. 할 일이 남은 우편은 상한과 상관없이 모두 돌려준다 */
export const MAIL_LIST_LIMIT = 100;

export interface MailRow {
  id: number;
  title: string;
  body: string;
  gold: number;
  createdAt: string;
  readAt: string | null;
  claimedAt: string | null;
}

type RawMail = { id: string | number; title: string; body: string; gold: string | number; created_at: Date | string; read_at: Date | string | null; claimed_at: Date | string | null };

const iso = (v: Date | string | null): string | null => (v === null ? null : new Date(v).toISOString());

const toMail = (r: RawMail): MailRow => ({
  id: Number(r.id), title: r.title, body: r.body, gold: Number(r.gold),
  createdAt: iso(r.created_at)!, readAt: iso(r.read_at), claimedAt: iso(r.claimed_at),
});

/**
 * 본인 우편 목록(최근 순). 할 일이 남은 우편(골드는 받기 전, 글은 읽기 전)은 모두 넣고,
 * 그 밖의 우편은 최근 MAIL_LIST_LIMIT통만 넣는다. 오래 쌓여도 받을 우편이 목록에서 빠지지 않는다.
 */
export async function listMails(db: Executor, uid: string): Promise<MailRow[]> {
  const { rows } = await db.execute<RawMail>(sql`select id, title, body, gold, created_at, read_at, claimed_at
    from public.mails m
    where m.user_id = ${uid}
      and ((m.gold > 0 and m.claimed_at is null) or (m.gold = 0 and m.read_at is null)
        or m.id in (select r.id from public.mails r where r.user_id = ${uid}
                    order by r.created_at desc, r.id desc limit ${MAIL_LIST_LIMIT}))
    order by m.created_at desc, m.id desc`);
  return rows.map(toMail);
}

/** 처음 열어 본 시각을 남긴다. 이미 읽었거나 본인 우편이 아니면 바꾸지 않는다 */
export async function markMailRead(db: Executor, uid: string, id: number, nowISO: string): Promise<void> {
  await db.execute(sql`update public.mails set read_at = ${at(nowISO)}
    where id = ${id} and user_id = ${uid} and read_at is null`);
}

/** 받을 수 있는 골드 — 본인 우편이고 골드가 있으며 아직 받지 않았을 때만 금액, 아니면 null */
export async function claimableGold(db: Executor, uid: string, id: number): Promise<number | null> {
  const { rows } = await db.execute<{ gold: string | number }>(sql`select gold from public.mails
    where id = ${id} and user_id = ${uid} and gold > 0 and claimed_at is null`);
  return rows[0] ? Number(rows[0].gold) : null;
}

/**
 * 골드 받기 확정 조각 — 액션 확정 문장(낙관 락)과 같은 문장에서 받은 시각을 남긴다.
 * 같은 버전을 읽은 두 요청 중 확정되는 것은 하나뿐이고, 이후 요청은 claimableGold가 null이라 거부된다.
 */
export function claimMailFragment(guard: SQL, uid: string, id: number, nowISO: string): SQL {
  return sql`update public.mails set claimed_at = ${at(nowISO)}, read_at = coalesce(read_at, ${at(nowISO)})
    where id = ${id} and user_id = ${uid} and claimed_at is null and ${guard}`;
}

/** 계정 정리 — 이 계정의 우편을 지운다 */
export async function deleteUserMails(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.mails where user_id = ${uid}`);
}

// ---------- 보내기 ----------

export interface MailRecipient { userId: string; gold: number }
export interface MailDraft { title: string; body: string; recipients: readonly MailRecipient[] }

export type DraftProblem = 'title' | 'body' | 'gold' | 'recipients' | 'duplicate';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 형태 검증 — 문제가 없으면 빈 배열 */
export function draftProblems(draft: MailDraft): DraftProblem[] {
  const out: DraftProblem[] = [];
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (title.length === 0 || title.length > MAIL_TITLE_MAX) out.push('title');
  if (body.length === 0 || body.length > MAIL_BODY_MAX) out.push('body');
  if (draft.recipients.some(r => !Number.isSafeInteger(r.gold) || r.gold < 0 || r.gold > MAIL_GOLD_MAX)) out.push('gold');
  if (draft.recipients.length === 0 || draft.recipients.some(r => !UUID.test(r.userId))) out.push('recipients');
  if (new Set(draft.recipients.map(r => r.userId.toLowerCase())).size !== draft.recipients.length) out.push('duplicate');
  return out;
}

export interface SendPreview {
  /** 실제로 받을 계정 수 */
  count: number;
  totalGold: number;
  /** 계정이 없어 빠지는 대상 */
  missing: string[];
}

/** 보내기 미리보기 — 쓰지 않는다 */
export async function previewMails(db: Executor, draft: MailDraft): Promise<SendPreview> {
  const { rows } = await db.execute<{ id: string }>(sql`select r."userId"::text as id
    from json_to_recordset(${jsonParam(draft.recipients)}) as r("userId" uuid, gold bigint)
    join auth.users u on u.id = r."userId"`);
  const found = new Set(rows.map(r => r.id.toLowerCase()));
  const present = draft.recipients.filter(r => found.has(r.userId.toLowerCase()));
  return {
    count: present.length,
    totalGold: present.reduce((sum, r) => sum + r.gold, 0),
    missing: draft.recipients.filter(r => !found.has(r.userId.toLowerCase())).map(r => r.userId),
  };
}

/** 보낸다 — 계정이 있는 대상에게만 넣고 넣은 수를 돌려준다. 형태 검증은 호출자가 먼저 한다 */
export async function sendMails(db: Executor, draft: MailDraft, nowISO: string): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(sql`with ins as (
      insert into public.mails (user_id, title, body, gold, created_at)
      select r."userId", ${draft.title.trim()}, ${draft.body.trim()}, r.gold, ${at(nowISO)}
      from json_to_recordset(${jsonParam(draft.recipients)}) as r("userId" uuid, gold bigint)
      join auth.users u on u.id = r."userId"
      returning 1)
    select count(*)::int as n from ins`);
  return rows[0].n;
}

/** 전체 대상 — 저장 상태가 있는 제재되지 않은 계정 */
export async function allPlayerIds(db: Executor): Promise<string[]> {
  const { rows } = await db.execute<{ id: string }>(sql`select user_id::text as id from public.saves_current
    where not restricted order by user_id`);
  return rows.map(r => r.id);
}

/** 보낼 대상 — 지정한 계정마다 금액, 또는 전체 플레이어에게 같은 금액 */
export type MailTarget =
  | { kind: 'users'; recipients: readonly MailRecipient[] }
  | { kind: 'all'; gold: number };

export interface MailRequest { title: string; body: string; target: MailTarget }

export interface MailPlan { problems: DraftProblem[]; preview: SendPreview | null }

async function draftOf(db: Executor, req: MailRequest): Promise<MailDraft> {
  const recipients = req.target.kind === 'all'
    ? (await allPlayerIds(db)).map(userId => ({ userId, gold: (req.target as { gold: number }).gold }))
    : req.target.recipients;
  return { title: req.title, body: req.body, recipients };
}

/**
 * 보내기 미리보기 — 관리자 서버 함수와 운영 스크립트가 같은 함수를 쓴다. 쓰지 않는다.
 * 형태 문제가 있으면 미리보기 없이 문제만 돌려준다.
 */
export async function planMail(db: Executor, req: MailRequest): Promise<MailPlan> {
  const draft = await draftOf(db, req);
  const problems = draftProblems(draft);
  return { problems, preview: problems.length > 0 ? null : await previewMails(db, draft) };
}

/** 보내기 — 형태 문제가 없을 때만 넣는다. 넣은 수(sent)와 넣기 직전 미리보기를 돌려준다 */
export async function deliverMail(db: Executor, req: MailRequest, nowISO: string): Promise<MailPlan & { sent: number }> {
  const draft = await draftOf(db, req);
  const problems = draftProblems(draft);
  if (problems.length > 0) return { problems, preview: null, sent: 0 };
  const preview = await previewMails(db, draft);
  return { problems, preview, sent: await sendMails(db, draft, nowISO) };
}

/** 요청 본문을 보내기 요청으로 읽는다. 형태가 틀리면 null — 값의 범위 검증은 draftProblems가 한다 */
export function parseMailRequest(raw: unknown): MailRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { title, body, target } = raw as Record<string, unknown>;
  if (typeof title !== 'string' || typeof body !== 'string' || typeof target !== 'object' || target === null) return null;
  const t = target as Record<string, unknown>;
  if (t.kind === 'all') return typeof t.gold === 'number' ? { title, body, target: { kind: 'all', gold: t.gold } } : null;
  if (t.kind !== 'users' || !Array.isArray(t.recipients)) return null;
  const recipients: MailRecipient[] = [];
  for (const r of t.recipients) {
    if (typeof r !== 'object' || r === null) return null;
    const { userId, gold } = r as Record<string, unknown>;
    if (typeof userId !== 'string' || typeof gold !== 'number') return null;
    recipients.push({ userId, gold });
  }
  return { title, body, target: { kind: 'users', recipients } };
}

// ---------- 관리자 조회 ----------

export interface SentMailRow extends MailRow { userId: string }

/** 최근 보낸 우편(관리자) */
export async function recentSentMails(db: Executor, limit = 200): Promise<SentMailRow[]> {
  const { rows } = await db.execute<RawMail & { user_id: string }>(sql`select id, user_id::text as user_id, title, body, gold,
    created_at, read_at, claimed_at from public.mails order by created_at desc, id desc limit ${limit}`);
  return rows.map(r => ({ ...toMail(r), userId: r.user_id }));
}
