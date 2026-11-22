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
/** 한 번의 우편 보내기로 지급할 수 있는 총 골드 상한 */
export const MAX_MAIL_BATCH_TOTAL_GOLD = 500_000_000;
/** 멱등 키와 최근 동일 우편 중복 차단 창(10분) */
export const MAIL_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
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

export type DraftProblem = 'title' | 'body' | 'gold' | 'recipients' | 'duplicate' | 'totalGold';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 정규화된 중복 수신자 uid 목록을 반환한다 */
export function duplicateRecipientIds(recipients: readonly MailRecipient[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  const added = new Set<string>();
  for (const r of recipients) {
    const id = r.userId.toLowerCase();
    if (seen.has(id)) {
      if (!added.has(id)) {
        added.add(id);
        dupes.push(id);
      }
    } else {
      seen.add(id);
    }
  }
  return dupes;
}

/** 형태 검증 — 문제가 없으면 빈 배열 */
export function draftProblems(draft: MailDraft): DraftProblem[] {
  const out: DraftProblem[] = [];
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (title.length === 0 || title.length > MAIL_TITLE_MAX) out.push('title');
  if (body.length === 0 || body.length > MAIL_BODY_MAX) out.push('body');
  if (draft.recipients.some(r => !Number.isSafeInteger(r.gold) || r.gold < 0 || r.gold > MAIL_GOLD_MAX)) out.push('gold');
  if (draft.recipients.length === 0 || draft.recipients.some(r => !UUID.test(r.userId))) out.push('recipients');
  if (duplicateRecipientIds(draft.recipients).length > 0) out.push('duplicate');
  return out;
}

export interface SendPreview {
  /** 실제로 받을 계정 수 */
  count: number;
  recipientCount: number;
  totalGold: number;
  capExceeded: boolean;
  maxTotalGold: number;
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
  const totalGold = present.reduce((sum, r) => sum + r.gold, 0);
  return {
    count: present.length,
    recipientCount: present.length,
    totalGold,
    capExceeded: totalGold > MAX_MAIL_BATCH_TOTAL_GOLD,
    maxTotalGold: MAX_MAIL_BATCH_TOTAL_GOLD,
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

/** 최근 중복 발송 창(10분) 안에 같은 제목·본문·골드·수신자가 이미 발송됐는지 확인한다 */
export async function hasRecentDuplicateMail(db: Executor, draft: MailDraft, nowISO: string): Promise<boolean> {
  const { rows } = await db.execute<{ found: boolean }>(sql`select exists (
      select 1
      from json_to_recordset(${jsonParam(draft.recipients)}) as r("userId" uuid, gold bigint)
      where exists (
        select 1 from public.mails m
        where m.user_id = r."userId"
          and m.title = ${draft.title.trim()}
          and m.body = ${draft.body.trim()}
          and m.gold = r.gold
          and m.created_at >= ${at(nowISO)} - interval '10 minutes'
          and m.created_at <= ${at(nowISO)}
      )
    ) as found`);
  return rows[0].found;
}

/** 최근 동일 우편 중복 차단 오류 */
export class DuplicateMailError extends Error {
  constructor() {
    super('duplicate-mail');
    this.name = 'DuplicateMailError';
  }
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

export interface MailRequest { title: string; body: string; target: MailTarget; idempotencyKey?: string }

export interface MailPlan {
  problems: DraftProblem[];
  duplicates?: string[];
  preview: SendPreview | null;
  idempotent?: boolean;
}

interface CachedMailSend {
  expiresAt: number;
  fingerprint: string;
  result: MailPlan & { sent: number };
}

const mailIdempotencyCache = new Map<string, CachedMailSend>();
const mailInFlight = new Map<string, Promise<MailPlan & { sent: number }>>();

/** 테스트용 멱등 캐시 초기화 */
export function clearMailIdempotencyCache(): void {
  mailIdempotencyCache.clear();
  mailInFlight.clear();
}

function pruneIdempotencyCache(nowMs: number): void {
  for (const [key, entry] of mailIdempotencyCache) {
    if (entry.expiresAt <= nowMs) mailIdempotencyCache.delete(key);
  }
}

function mailFingerprint(req: MailRequest): string {
  return JSON.stringify({ title: req.title.trim(), body: req.body.trim(), target: req.target });
}

async function draftOf(db: Executor, req: MailRequest): Promise<MailDraft> {
  const recipients = req.target.kind === 'all'
    ? (await allPlayerIds(db)).map(userId => ({ userId, gold: (req.target as { gold: number }).gold }))
    : req.target.recipients;
  return { title: req.title, body: req.body, recipients };
}

/**
 * 보내기 미리보기 — 관리자 서버 함수와 운영 스크립트가 같은 함수를 쓴다. 쓰지 않는다.
 * 형태 문제가 있으면 미리보기 없이 문제만 돌려주고, 상한 초과는 preview(capExceeded=true)와 totalGold 문제를 함께 돌려준다.
 */
export async function planMail(db: Executor, req: MailRequest): Promise<MailPlan> {
  const draft = await draftOf(db, req);
  const problems = draftProblems(draft);
  if (problems.length > 0) {
    const duplicates = duplicateRecipientIds(draft.recipients);
    return { problems, ...(duplicates.length > 0 ? { duplicates } : {}), preview: null };
  }
  const preview = await previewMails(db, draft);
  return { problems: preview.capExceeded ? ['totalGold'] : [], preview };
}

/** 보내기 — 형태 문제와 상한 초과·중복 발송이 없을 때만 넣는다. 넣은 수(sent)와 넣기 직전 미리보기를 돌려준다 */
export async function deliverMail(db: Executor, req: MailRequest, nowISO: string): Promise<MailPlan & { sent: number }> {
  const key = req.idempotencyKey;
  const nowMs = Date.now();
  const fingerprint = mailFingerprint(req);

  if (key) {
    pruneIdempotencyCache(nowMs);
    const cached = mailIdempotencyCache.get(key);
    if (cached && cached.expiresAt > nowMs) {
      if (cached.fingerprint !== fingerprint) throw new DuplicateMailError();
      return { ...cached.result, sent: 0, idempotent: true };
    }
    const pending = mailInFlight.get(key);
    if (pending) {
      const done = await pending;
      return { ...done, sent: 0, idempotent: true };
    }
  }

  const run = async (): Promise<MailPlan & { sent: number }> => {
    const draft = await draftOf(db, req);
    const problems = draftProblems(draft);
    if (problems.length > 0) {
      const duplicates = duplicateRecipientIds(draft.recipients);
      return { problems, ...(duplicates.length > 0 ? { duplicates } : {}), preview: null, sent: 0 };
    }
    const preview = await previewMails(db, draft);
    if (preview.capExceeded) return { problems: ['totalGold'], preview, sent: 0 };
    if (await hasRecentDuplicateMail(db, draft, nowISO)) throw new DuplicateMailError();
    const sent = await sendMails(db, draft, nowISO);
    const result: MailPlan & { sent: number } = { problems: [], preview, sent };
    if (key) {
      mailIdempotencyCache.set(key, {
        expiresAt: Date.now() + MAIL_IDEMPOTENCY_TTL_MS,
        fingerprint,
        result,
      });
    }
    return result;
  };

  if (!key) return run();

  const promise = run();
  mailInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    mailInFlight.delete(key);
  }
}

/** 요청 본문을 보내기 요청으로 읽는다. 형태가 틀리면 null — 값의 범위 검증은 draftProblems가 한다 */
export function parseMailRequest(raw: unknown): MailRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { title, body, target, idempotencyKey } = raw as Record<string, unknown>;
  if (typeof title !== 'string' || typeof body !== 'string' || typeof target !== 'object' || target === null) return null;
  if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0 || idempotencyKey.length > 128)) {
    return null;
  }
  const keyProp = typeof idempotencyKey === 'string' ? { idempotencyKey: idempotencyKey.trim() } : {};
  const t = target as Record<string, unknown>;
  if (t.kind === 'all') return typeof t.gold === 'number' ? { title, body, target: { kind: 'all', gold: t.gold }, ...keyProp } : null;
  if (t.kind !== 'users' || !Array.isArray(t.recipients)) return null;
  const recipients: MailRecipient[] = [];
  for (const r of t.recipients) {
    if (typeof r !== 'object' || r === null) return null;
    const { userId, gold } = r as Record<string, unknown>;
    if (typeof userId !== 'string' || typeof gold !== 'number') return null;
    recipients.push({ userId, gold });
  }
  return { title, body, target: { kind: 'users', recipients }, ...keyProp };
}

// ---------- 관리자 조회 ----------

export interface SentMailRow extends MailRow { userId: string }

/** 최근 보낸 우편(관리자) */
export async function recentSentMails(db: Executor, limit = 200): Promise<SentMailRow[]> {
  const { rows } = await db.execute<RawMail & { user_id: string }>(sql`select id, user_id::text as user_id, title, body, gold,
    created_at, read_at, claimed_at from public.mails order by created_at desc, id desc limit ${limit}`);
  return rows.map(r => ({ ...toMail(r), userId: r.user_id }));
}
