// 우편(mails) 소유 모듈 — 운영자가 플레이어에게 보내는 제목·본문·골드·첨부 아이템·첨부 모자.
// 플레이어 쪽은 목록·읽음과 받기 확정 조각, 운영 쪽은 보내기 미리보기와 보내기를 맡는다.
// 보내기는 관리자 서버 함수와 운영 스크립트가 같은 함수를 쓴다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { isAttachableItemId, itemStorageAmount } from '../../src/game/content/itemCatalog.js';
import { hatById } from '../../src/game/content/wardrobe.js';
import { ITEM_CAP } from '../../src/game/rules/logic.js';
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

export interface MailItemAttachment {
  id: string;
  qty: number;
}

export interface MailRow {
  id: number;
  title: string;
  body: string;
  gold: number;
  items: MailItemAttachment[];
  hats: string[];
  createdAt: string;
  readAt: string | null;
  claimedAt: string | null;
}

export interface ClaimableMail {
  gold: number;
  items: MailItemAttachment[];
  hats: string[];
}

type RawMail = {
  id: string | number;
  title: string;
  body: string;
  gold: string | number;
  items: unknown;
  hats: unknown;
  created_at: Date | string;
  read_at: Date | string | null;
  claimed_at: Date | string | null;
};

const iso = (v: Date | string | null): string | null => (v === null ? null : new Date(v).toISOString());

function parseStoredItems(raw: unknown): MailItemAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: MailItemAttachment[] = [];
  for (const el of raw) {
    if (typeof el !== 'object' || el === null) continue;
    const { id, qty } = el as { id?: unknown; qty?: unknown };
    if (typeof id === 'string' && typeof qty === 'number' && Number.isFinite(qty) && qty > 0) {
      out.push({ id, qty });
    }
  }
  return out;
}

function parseStoredHats(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const el of raw) {
    if (typeof el === 'string' && el.length > 0 && !seen.has(el)) {
      seen.add(el);
      out.push(el);
    }
  }
  return out;
}

const toMail = (r: RawMail): MailRow => ({
  id: Number(r.id), title: r.title, body: r.body, gold: Number(r.gold),
  items: parseStoredItems(r.items),
  hats: parseStoredHats(r.hats),
  createdAt: iso(r.created_at)!, readAt: iso(r.read_at), claimedAt: iso(r.claimed_at),
});

/**
 * 본인 우편 목록(최근 순). 할 일이 남은 우편(골드·아이템·모자 첨부는 받기 전, 글은 읽기 전)은 모두 넣고,
 * 그 밖의 우편은 최근 MAIL_LIST_LIMIT통만 넣는다. 오래 쌓여도 받을 우편이 목록에서 빠지지 않는다.
 */
export async function listMails(db: Executor, uid: string): Promise<MailRow[]> {
  const { rows } = await db.execute<RawMail>(sql`select id, title, body, gold, items, hats, created_at, read_at, claimed_at
    from public.mails m
    where m.user_id = ${uid}
      and (((m.gold > 0 or jsonb_array_length(m.items) > 0 or jsonb_array_length(m.hats) > 0) and m.claimed_at is null)
        or (m.gold = 0 and jsonb_array_length(m.items) = 0 and jsonb_array_length(m.hats) = 0 and m.read_at is null)
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

/** 받을 수 있는 우편 보상 — 본인 우편이고 골드·아이템·모자가 있으며 아직 받지 않았을 때만 반환, 아니면 null */
export async function claimableMail(db: Executor, uid: string, id: number): Promise<ClaimableMail | null> {
  const { rows } = await db.execute<{ gold: string | number; items: unknown; hats: unknown }>(sql`select gold, items, hats from public.mails
    where id = ${id} and user_id = ${uid} and claimed_at is null
      and (gold > 0 or jsonb_array_length(items) > 0 or jsonb_array_length(hats) > 0)`);
  if (!rows[0]) return null;
  return { gold: Number(rows[0].gold), items: parseStoredItems(rows[0].items), hats: parseStoredHats(rows[0].hats) };
}

/**
 * 우편 받기 확정 조각 — 액션 확정 문장(낙관 락)과 같은 문장에서 받은 시각을 남긴다.
 * 같은 버전을 읽은 두 요청 중 확정되는 것은 하나뿐이고, 이후 요청은 claimableMail이 null이라 거부된다.
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

export interface MailRecipient {
  userId: string;
  gold?: number;
  items?: readonly MailItemAttachment[];
  hats?: readonly string[];
}
export interface MailDraft {
  title: string;
  body: string;
  recipients: readonly MailRecipient[];
  items?: readonly MailItemAttachment[];
  hats?: readonly string[];
}

export type DraftProblem = 'title' | 'body' | 'gold' | 'items' | 'hats' | 'empty' | 'recipients' | 'duplicate' | 'totalGold';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mergeMailItems(items: readonly MailItemAttachment[] | undefined): MailItemAttachment[] {
  if (!items || items.length === 0) return [];
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.id, (merged.get(item.id) ?? 0) + item.qty);
  }
  return [...merged.entries()].map(([id, qty]) => ({ id, qty }));
}

/** 첨부 아이템 배열을 id 오름차순으로 정규화한다(중복 id는 합산). */
export function normalizeMailItems(items: readonly MailItemAttachment[] | undefined): MailItemAttachment[] {
  return mergeMailItems(items).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function dedupeMailHats(hats: readonly string[] | undefined): string[] {
  if (!hats || hats.length === 0) return [];
  return Array.from(new Set(hats));
}

/** 첨부 모자 id 배열을 오름차순으로 정규화한다(중복 id는 제거). */
export function normalizeMailHats(hats: readonly string[] | undefined): string[] {
  return dedupeMailHats(hats).sort();
}

function itemsValid(items: readonly MailItemAttachment[]): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item.id !== 'string' || !isAttachableItemId(item.id)) return false;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    if (!Number.isSafeInteger(item.qty) || item.qty < 1) return false;
    const storage = itemStorageAmount(item.id, item.qty);
    if (storage < 1 || storage > ITEM_CAP) return false;
  }
  return true;
}

function hatsValid(hats: readonly string[]): boolean {
  for (const id of hats) {
    if (typeof id !== 'string' || !hatById(id)) return false;
  }
  return true;
}

const recipientGold = (r: MailRecipient): number => r.gold ?? 0;
const recipientItems = (r: MailRecipient, draftItems?: readonly MailItemAttachment[]): readonly MailItemAttachment[] =>
  r.items ?? draftItems ?? [];
const recipientHats = (r: MailRecipient, draftHats?: readonly string[]): readonly string[] =>
  r.hats ?? draftHats ?? [];

/** 정규화된 중복 수신자 uid 목록을 반환한다 */
export function duplicateRecipientIds(recipients: readonly MailRecipient[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  const added = new Set<string>();
  for (const r of recipients) {
    const id = r.userId.trim().toLowerCase();
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
  if (draft.recipients.some(r => {
    const gold = recipientGold(r);
    return !Number.isSafeInteger(gold) || gold < 0 || gold > MAIL_GOLD_MAX;
  })) out.push('gold');
  const invalidDraftItems = draft.items !== undefined && !itemsValid(draft.items);
  const invalidRecipientItems = draft.recipients.some(r => !itemsValid(recipientItems(r, draft.items)));
  if (invalidDraftItems || invalidRecipientItems) out.push('items');
  const invalidDraftHats = draft.hats !== undefined && !hatsValid(draft.hats);
  const invalidRecipientHats = draft.recipients.some(r => !hatsValid(recipientHats(r, draft.hats)));
  if (invalidDraftHats || invalidRecipientHats) out.push('hats');
  if (draft.recipients.some(r =>
    recipientGold(r) === 0
    && recipientItems(r, draft.items).length === 0
    && recipientHats(r, draft.hats).length === 0
  )) {
    out.push('empty');
  }
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

function recipientRows(draft: MailDraft): { userId: string; gold: number; items: MailItemAttachment[]; hats: string[] }[] {
  return draft.recipients.map(r => ({
    userId: r.userId,
    gold: recipientGold(r),
    items: normalizeMailItems(recipientItems(r, draft.items)),
    hats: normalizeMailHats(recipientHats(r, draft.hats)),
  }));
}

/** 보내기 미리보기 — 쓰지 않는다 */
export async function previewMails(db: Executor, draft: MailDraft): Promise<SendPreview> {
  const payload = recipientRows(draft);
  const { rows } = await db.execute<{ id: string }>(sql`select r."userId"::text as id
    from json_to_recordset(${jsonParam(payload)}) as r("userId" uuid, gold bigint, items jsonb, hats jsonb)
    join auth.users u on u.id = r."userId"`);
  const found = new Set(rows.map(r => r.id.toLowerCase()));
  const present = draft.recipients.filter(r => found.has(r.userId.toLowerCase()));
  const totalGold = present.reduce((sum, r) => sum + recipientGold(r), 0);
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
  const payload = recipientRows(draft);
  const { rows } = await db.execute<{ n: number }>(sql`with ins as (
      insert into public.mails (user_id, title, body, gold, items, hats, created_at)
      select r."userId", ${draft.title.trim()}, ${draft.body.trim()}, r.gold, r.items, r.hats, ${at(nowISO)}
      from json_to_recordset(${jsonParam(payload)}) as r("userId" uuid, gold bigint, items jsonb, hats jsonb)
      join auth.users u on u.id = r."userId"
      returning 1)
    select count(*)::int as n from ins`);
  return rows[0].n;
}

export interface IdempotentMailRequest {
  userId: string;
  idempotencyKey: string;
  title: string;
  body: string;
  gold: number;
  items: readonly MailItemAttachment[];
  hats?: readonly string[];
}

/** 멱등 키 기준으로 단건 우편을 발송한다. 이미 같은 (user_id, idempotency_key)가 있으면 건너뛰고 실제 삽입 여부를 반환한다 */
export async function sendIdempotentMail(
  db: Executor,
  req: IdempotentMailRequest,
  nowISO: string,
): Promise<boolean> {
  const idempotencyKey = typeof req.idempotencyKey === 'string' ? req.idempotencyKey.trim() : '';
  if (idempotencyKey.length === 0 || idempotencyKey.length > 128) {
    throw new Error('invalid idempotencyKey');
  }
  const hasInvalidRawItem = req.items.some(
    item => typeof item.id !== 'string'
      || !isAttachableItemId(item.id)
      || !Number.isSafeInteger(item.qty)
      || item.qty < 1,
  );
  const items = hasInvalidRawItem ? [] : mergeMailItems(req.items);
  const rawHats = req.hats ?? [];
  const hasInvalidRawHat = rawHats.some(id => typeof id !== 'string' || !hatById(id));
  const hats = hasInvalidRawHat ? [] : dedupeMailHats(rawHats);
  const problems = draftProblems({
    title: req.title,
    body: req.body,
    recipients: [{
      userId: req.userId,
      gold: req.gold,
      items: hasInvalidRawItem ? req.items : items,
      ...(rawHats.length > 0 ? { hats: hasInvalidRawHat ? rawHats : hats } : {}),
    }],
  });
  if (problems.length > 0) {
    throw new Error(`invalid idempotent mail: ${problems.join(', ')}`);
  }
  const { rows } = await db.execute<{ id: string | number }>(sql`
    insert into public.mails (user_id, idempotency_key, title, body, gold, items, hats, created_at)
    values (${req.userId}::uuid, ${idempotencyKey}, ${req.title.trim()}, ${req.body.trim()}, ${req.gold}, ${JSON.stringify(items)}::jsonb, ${JSON.stringify(hats)}::jsonb, ${at(nowISO)})
    on conflict (user_id, idempotency_key) where idempotency_key is not null do nothing
    returning id
  `);
  return rows.length > 0;
}

/** 최근 중복 발송 창(10분) 안에 같은 제목·본문·골드·첨부·수신자가 이미 발송됐는지 확인한다 */
export async function hasRecentDuplicateMail(db: Executor, draft: MailDraft, nowISO: string): Promise<boolean> {
  const payload = recipientRows(draft);
  const { rows } = await db.execute<{ found: boolean }>(sql`select exists (
      select 1
      from json_to_recordset(${jsonParam(payload)}) as r("userId" uuid, gold bigint, items jsonb, hats jsonb)
      where exists (
        select 1 from public.mails m
        where m.user_id = r."userId"
          and m.title = ${draft.title.trim()}
          and m.body = ${draft.body.trim()}
          and m.gold = r.gold
          and m.items = r.items
          and m.hats = r.hats
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

/** 보낼 대상 — 지정한 계정마다 금액·첨부, 또는 전체 플레이어에게 같은 금액·첨부 */
export type MailTarget =
  | { kind: 'users'; recipients: readonly MailRecipient[] }
  | { kind: 'all'; gold?: number; items?: readonly MailItemAttachment[]; hats?: readonly string[] };

export interface MailRequest {
  title: string;
  body: string;
  target: MailTarget;
  items?: readonly MailItemAttachment[];
  hats?: readonly string[];
  idempotencyKey?: string;
}

export interface MailPlan {
  problems: DraftProblem[];
  duplicates?: string[];
  preview: SendPreview | null;
  idempotent?: boolean;
}

/** 테스트용 DB 멱등 키 초기화 */
export async function clearMailIdempotencyCache(db?: Executor): Promise<void> {
  if (db) await db.execute(sql`delete from public.admin_mail_idempotency`);
}

function mailFingerprint(req: MailRequest): string {
  const target = req.target.kind === 'all'
    ? {
      kind: 'all',
      gold: req.target.gold ?? 0,
      items: normalizeMailItems(req.target.items ?? req.items),
      hats: normalizeMailHats(req.target.hats ?? req.hats),
    }
    : {
      kind: 'users',
      recipients: req.target.recipients.map(r => ({
        userId: r.userId.trim().toLowerCase(),
        gold: recipientGold(r),
        items: normalizeMailItems(recipientItems(r, req.items)),
        hats: normalizeMailHats(recipientHats(r, req.hats)),
      })),
    };
  return JSON.stringify({ title: req.title.trim(), body: req.body.trim(), target });
}

function quickRequestProblems(req: MailRequest): { problems: DraftProblem[]; duplicates?: string[] } | null {
  if (req.target.kind === 'users') {
    const draft: MailDraft = {
      title: req.title,
      body: req.body,
      recipients: req.target.recipients,
      ...(req.items !== undefined ? { items: req.items } : {}),
      ...(req.hats !== undefined ? { hats: req.hats } : {}),
    };
    const problems = draftProblems(draft);
    if (problems.length > 0) {
      const duplicates = duplicateRecipientIds(draft.recipients);
      return { problems, ...(duplicates.length > 0 ? { duplicates } : {}) };
    }
    return null;
  }
  const items = req.target.items ?? req.items;
  const hats = req.target.hats ?? req.hats;
  const problems = draftProblems({
    title: req.title,
    body: req.body,
    recipients: [{
      userId: '00000000-0000-4000-8000-000000000000',
      gold: req.target.gold ?? 0,
      ...(items !== undefined ? { items } : {}),
      ...(hats !== undefined ? { hats } : {}),
    }],
    ...(req.items !== undefined ? { items: req.items } : {}),
    ...(req.hats !== undefined ? { hats: req.hats } : {}),
  });
  return problems.length > 0 ? { problems } : null;
}

async function draftOf(db: Executor, req: MailRequest): Promise<MailDraft> {
  if (req.target.kind === 'all') {
    const gold = req.target.gold ?? 0;
    const items = req.target.items ?? req.items;
    const hats = req.target.hats ?? req.hats;
    const recipients = (await allPlayerIds(db)).map(userId => ({
      userId,
      gold,
      ...(items !== undefined ? { items } : {}),
      ...(hats !== undefined ? { hats } : {}),
    }));
    return {
      title: req.title,
      body: req.body,
      recipients,
      ...(items !== undefined ? { items } : {}),
      ...(hats !== undefined ? { hats } : {}),
    };
  }
  return {
    title: req.title,
    body: req.body,
    recipients: req.target.recipients,
    ...(req.items !== undefined ? { items: req.items } : {}),
    ...(req.hats !== undefined ? { hats: req.hats } : {}),
  };
}

/**
 * 보내기 미리보기 — 관리자 서버 함수와 운영 스크립트가 같은 함수를 쓴다. 쓰지 않는다.
 * 형태 문제가 있으면 미리보기 없이 문제만 돌려주고, 상한 초과는 preview(capExceeded=true)와 totalGold 문제를 함께 돌려준다.
 */
export async function planMail(db: Executor, req: MailRequest): Promise<MailPlan> {
  const quick = quickRequestProblems(req);
  if (quick) return { ...quick, preview: null };
  const draft = await draftOf(db, req);
  const problems = draftProblems(draft);
  if (problems.length > 0) {
    const duplicates = duplicateRecipientIds(draft.recipients);
    return { problems, ...(duplicates.length > 0 ? { duplicates } : {}), preview: null };
  }
  const preview = await previewMails(db, draft);
  if (preview.capExceeded) return { problems: ['totalGold'], preview };
  if (preview.count === 0) return { problems: ['recipients'], preview };
  return { problems: [], preview };
}

async function runSend(db: Executor, req: MailRequest, nowISO: string): Promise<MailPlan & { sent: number }> {
  const draft = await draftOf(db, req);
  const problems = draftProblems(draft);
  if (problems.length > 0) {
    const duplicates = duplicateRecipientIds(draft.recipients);
    return { problems, ...(duplicates.length > 0 ? { duplicates } : {}), preview: null, sent: 0 };
  }
  const preview = await previewMails(db, draft);
  if (preview.capExceeded) return { problems: ['totalGold'], preview, sent: 0 };
  if (preview.count === 0) return { problems: ['recipients'], preview, sent: 0 };
  if (await hasRecentDuplicateMail(db, draft, nowISO)) throw new DuplicateMailError();
  const sent = await sendMails(db, draft, nowISO);
  return { problems: [], preview, sent };
}

type IdempotencyRow = {
  fingerprint: string;
  result: (MailPlan & { sent: number }) | null;
  expires_at: Date | string;
};

/** 보내기 — 형태 문제와 상한 초과·중복 발송이 없을 때만 넣는다. 넣은 수(sent)와 넣기 직전 미리보기를 돌려준다 */
export async function deliverMail(db: Executor, req: MailRequest, nowISO: string): Promise<MailPlan & { sent: number }> {
  const quick = quickRequestProblems(req);
  if (quick) return { ...quick, preview: null, sent: 0 };

  const key = req.idempotencyKey;
  if (!key) return runSend(db, req, nowISO);

  const fingerprint = mailFingerprint(req);
  const nowMs = Date.now();
  const expiresAtISO = new Date(nowMs + MAIL_IDEMPOTENCY_TTL_MS).toISOString();
  const runInTx = <T>(work: (tx: Executor) => Promise<T>): Promise<T> => (
    typeof db.transaction === 'function' ? db.transaction(work) : work(db)
  );

  return runInTx(async tx => {
    let occupied = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const inserted = await tx.execute<{ key: string }>(sql`
        insert into public.admin_mail_idempotency (key, fingerprint, result, expires_at)
        values (${key}, ${fingerprint}, null, ${at(expiresAtISO)})
        on conflict (key) do nothing
        returning key
      `);
      if (inserted.rows.length > 0) {
        occupied = true;
        break;
      }

      const existing = await tx.execute<IdempotencyRow>(sql`
        select fingerprint, result, expires_at
        from public.admin_mail_idempotency
        where key = ${key}
        for update
      `);
      const row = existing.rows[0];
      if (!row) continue;

      if (new Date(row.expires_at).getTime() <= nowMs) {
        await tx.execute(sql`delete from public.admin_mail_idempotency where key = ${key}`);
        continue;
      }

      if (row.fingerprint !== fingerprint) throw new DuplicateMailError();
      if (!row.result) throw new DuplicateMailError();
      return row.result.problems.length > 0 ? row.result : { ...row.result, sent: 0, idempotent: true };
    }
    if (!occupied) throw new Error('admin-mail-idempotency-lock-failed');

    const result = await runSend(tx, req, nowISO);
    if (result.problems.length > 0) {
      await tx.execute(sql`delete from public.admin_mail_idempotency where key = ${key}`);
      return result;
    }
    await tx.execute(sql`
      update public.admin_mail_idempotency
      set result = ${JSON.stringify(result)}::jsonb, expires_at = ${at(expiresAtISO)}
      where key = ${key}
    `);
    return result;
  });
}

function parseRawItems(raw: unknown): MailItemAttachment[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MailItemAttachment[] = [];
  for (const el of raw) {
    if (typeof el !== 'object' || el === null) return null;
    const { id, qty } = el as Record<string, unknown>;
    if (typeof id !== 'string' || typeof qty !== 'number') return null;
    out.push({ id, qty });
  }
  return out;
}

function parseRawHats(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const el of raw) {
    if (typeof el !== 'string') return null;
    out.push(el);
  }
  return out;
}

/** 요청 본문을 보내기 요청으로 읽는다. 형태가 틀리면 null — 값의 범위 검증은 draftProblems가 한다 */
export function parseMailRequest(raw: unknown): MailRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { title, body, target, idempotencyKey, items, hats } = raw as Record<string, unknown>;
  if (typeof title !== 'string' || typeof body !== 'string' || typeof target !== 'object' || target === null) return null;
  if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0 || idempotencyKey.length > 128)) {
    return null;
  }
  let topItemsProp: { items: MailItemAttachment[] } | Record<string, never> = {};
  if (items !== undefined) {
    const parsed = parseRawItems(items);
    if (!parsed) return null;
    topItemsProp = { items: parsed };
  }
  let topHatsProp: { hats: string[] } | Record<string, never> = {};
  if (hats !== undefined) {
    const parsed = parseRawHats(hats);
    if (!parsed) return null;
    topHatsProp = { hats: parsed };
  }
  const keyProp = typeof idempotencyKey === 'string' ? { idempotencyKey: idempotencyKey.trim() } : {};
  const t = target as Record<string, unknown>;
  if (t.kind === 'all') {
    if (t.gold !== undefined && typeof t.gold !== 'number') return null;
    let targetItemsProp: { items: MailItemAttachment[] } | Record<string, never> = {};
    if (t.items !== undefined) {
      const parsed = parseRawItems(t.items);
      if (!parsed) return null;
      targetItemsProp = { items: parsed };
    }
    let targetHatsProp: { hats: string[] } | Record<string, never> = {};
    if (t.hats !== undefined) {
      const parsed = parseRawHats(t.hats);
      if (!parsed) return null;
      targetHatsProp = { hats: parsed };
    }
    return {
      title, body,
      target: { kind: 'all', gold: t.gold ?? 0, ...targetItemsProp, ...targetHatsProp },
      ...topItemsProp, ...topHatsProp, ...keyProp,
    };
  }
  if (t.kind !== 'users' || !Array.isArray(t.recipients)) return null;
  const recipients: MailRecipient[] = [];
  for (const r of t.recipients) {
    if (typeof r !== 'object' || r === null) return null;
    const { userId, gold, items: rItemsRaw, hats: rHatsRaw } = r as Record<string, unknown>;
    if (typeof userId !== 'string') return null;
    if (gold !== undefined && typeof gold !== 'number') return null;
    let rItemsProp: { items: MailItemAttachment[] } | Record<string, never> = {};
    if (rItemsRaw !== undefined) {
      const parsed = parseRawItems(rItemsRaw);
      if (!parsed) return null;
      rItemsProp = { items: parsed };
    }
    let rHatsProp: { hats: string[] } | Record<string, never> = {};
    if (rHatsRaw !== undefined) {
      const parsed = parseRawHats(rHatsRaw);
      if (!parsed) return null;
      rHatsProp = { hats: parsed };
    }
    recipients.push({ userId, gold: gold ?? 0, ...rItemsProp, ...rHatsProp });
  }
  return { title, body, target: { kind: 'users', recipients }, ...topItemsProp, ...topHatsProp, ...keyProp };
}

// ---------- 관리자 조회 ----------

export interface SentMailRow extends MailRow { userId: string }

/** 최근 보낸 우편(관리자) */
export async function recentSentMails(db: Executor, limit = 200): Promise<SentMailRow[]> {
  const { rows } = await db.execute<RawMail & { user_id: string }>(sql`select id, user_id::text as user_id, title, body, gold, items, hats,
    created_at, read_at, claimed_at from public.mails order by created_at desc, id desc limit ${limit}`);
  return rows.map(r => ({ ...toMail(r), userId: r.user_id }));
}
