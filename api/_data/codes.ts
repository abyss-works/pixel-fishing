// 쿠폰·지원 코드(coupons·coupon_redemptions·reliefs) 쓰기 소유 모듈.
import { sql } from 'drizzle-orm';
import { isAttachableItemId, itemStorageAmount } from '../../src/game/content/itemCatalog.js';
import { ITEM_CAP } from '../../src/game/rules/logic.js';
import type { Executor } from '../_db/client.js';
import { at } from './json.js';
import { MAIL_GOLD_MAX, normalizeMailItems } from './mailbox.js';
import type { MailItemAttachment } from './mailbox.js';

export interface AdminCouponRow {
  code: string;
  gold: number;
  items: MailItemAttachment[];
  description: string;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  perAccountLimit: number;
  redeemedCount: number;
  createdAt: string;
}

export const COUPON_CODE_MAX = 64;
export const COUPON_DESC_MAX = 200;
/** PostgreSQL int4 최댓값 — max_redemptions·per_account_limit 상한 */
export const COUPON_LIMIT_MAX = 2_147_483_647;

export interface DynamicCoupon {
  gold: number;
  items: MailItemAttachment[];
  desc: string;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  perAccountLimit: number;
}

export interface DynamicCouponForUser extends DynamicCoupon {
  totalRedemptions: number;
  userRedemptions: number;
}

const isoOf = (column: string) =>
  sql.raw(`case when ${column} is null then null else to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end`);

function parseStoredItems(raw: unknown): MailItemAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: MailItemAttachment[] = [];
  for (const el of raw) {
    if (typeof el !== 'object' || el === null) continue;
    const { id, qty } = el as { id?: unknown; qty?: unknown };
    if (typeof id !== 'string' || !isAttachableItemId(id)) continue;
    if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 1) continue;
    const amount = itemStorageAmount(id, qty);
    if (amount < 1 || amount > ITEM_CAP) continue;
    out.push({ id, qty });
  }
  return out;
}

function parseDraftItems(raw: unknown): MailItemAttachment[] | null {
  if (!Array.isArray(raw)) return null;
  const parsed: MailItemAttachment[] = [];
  for (const el of raw) {
    if (typeof el !== 'object' || el === null || Array.isArray(el)) return null;
    const { id, qty } = el as Record<string, unknown>;
    if (typeof id !== 'string' || !isAttachableItemId(id)) return null;
    if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 1) return null;
    parsed.push({ id, qty });
  }
  const merged = normalizeMailItems(parsed);
  for (const item of merged) {
    const amount = itemStorageAmount(item.id, item.qty);
    if (amount < 1 || amount > ITEM_CAP) return null;
  }
  return merged;
}

type RawCouponRow = {
  gold: number;
  items: unknown;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  per_account_limit: number;
};

/** 현재 시각에 활성 기간 안에 있는 동적 쿠폰 조회 */
export async function findCoupon(
  db: Executor,
  code: string,
  nowISO: string = new Date().toISOString(),
): Promise<DynamicCoupon | null> {
  const { rows } = await db.execute<RawCouponRow>(sql`select
      gold,
      items,
      description,
      ${isoOf('starts_at')} as starts_at,
      ${isoOf('ends_at')} as ends_at,
      max_redemptions,
      per_account_limit
    from public.coupons
    where code = ${code}
      and active
      and (starts_at is null or starts_at <= ${at(nowISO)})
      and (ends_at is null or ends_at > ${at(nowISO)})`);
  const row = rows[0];
  if (!row) return null;
  return {
    gold: Number(row.gold),
    items: parseStoredItems(row.items),
    desc: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxRedemptions: row.max_redemptions === null ? null : Number(row.max_redemptions),
    perAccountLimit: Number(row.per_account_limit),
  };
}

/** 사용자별 사용 횟수와 함께 동적 쿠폰을 조회한다 */
export async function findCouponForUser(
  db: Executor,
  code: string,
  uid: string,
  nowISO: string = new Date().toISOString(),
): Promise<DynamicCouponForUser | null> {
  const { rows } = await db.execute<RawCouponRow & { total_redemptions: number; user_redemptions: number }>(sql`select
      c.gold,
      c.items,
      c.description,
      ${isoOf('c.starts_at')} as starts_at,
      ${isoOf('c.ends_at')} as ends_at,
      c.max_redemptions,
      c.per_account_limit,
      (select count(*)::int from public.coupon_redemptions r where r.code = c.code) as total_redemptions,
      (select count(*)::int from public.coupon_redemptions r where r.code = c.code and r.user_id = ${uid}::uuid) as user_redemptions
    from public.coupons c
    where c.code = ${code}
      and c.active
      and (c.starts_at is null or c.starts_at <= ${at(nowISO)})
      and (c.ends_at is null or c.ends_at > ${at(nowISO)})`);
  const row = rows[0];
  if (!row) return null;
  return {
    gold: Number(row.gold),
    items: parseStoredItems(row.items),
    desc: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxRedemptions: row.max_redemptions === null ? null : Number(row.max_redemptions),
    perAccountLimit: Number(row.per_account_limit),
    totalRedemptions: Number(row.total_redemptions),
    userRedemptions: Number(row.user_redemptions),
  };
}

/**
 * 동적 쿠폰 소비 — 쿠폰 행 잠금(FOR UPDATE)으로 동시 요청을 직렬화해
 * 전체 사용 한도(max_redemptions)와 계정별 한도(per_account_limit)를 원자적으로 검증·기록한다.
 * 액션 확정 트랜잭션 안에서 부른다. 확정이 실패하면 함께 되돌려진다.
 */
export async function consumeCoupon(
  tx: Executor,
  code: string,
  uid: string,
  nowISO: string,
  guest = false,
): Promise<'ok' | 'used' | 'invalid' | 'account-only'> {
  const { rows } = await tx.execute<{
    active: boolean;
    in_window: boolean;
    max_redemptions: number | null;
    per_account_limit: number;
  }>(sql`select
      active,
      ((starts_at is null or starts_at <= ${at(nowISO)}) and (ends_at is null or ends_at > ${at(nowISO)})) as in_window,
      max_redemptions,
      per_account_limit
    from public.coupons
    where code = ${code}
    for update`);
  const row = rows[0];
  if (!row || !row.active || !row.in_window) return 'invalid';

  const maxRedemptions = row.max_redemptions === null ? null : Number(row.max_redemptions);
  if (guest && maxRedemptions !== null) return 'account-only';

  const counts = await tx.execute<{ total: number; mine: number }>(sql`select
      count(*)::int as total,
      count(*) filter (where user_id = ${uid}::uuid)::int as mine
    from public.coupon_redemptions
    where code = ${code}`);
  const { total, mine } = counts.rows[0];
  const perAccountLimit = Number(row.per_account_limit);

  if (mine >= perAccountLimit) return 'used';
  if (maxRedemptions !== null && total >= maxRedemptions) return 'invalid';

  await tx.execute(sql`insert into public.coupon_redemptions (code, user_id, redeemed_at)
    values (${code}, ${uid}::uuid, ${at(nowISO)})`);
  return 'ok';
}

/** 계정 정리에서 사용자의 쿠폰 사용 이력을 모두 지운다 */
export async function deleteUserCouponRedemptions(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.coupon_redemptions where user_id = ${uid}::uuid`);
}

// ---------- 관리자 쿠폰 관리 ----------

export interface CouponDraftInput {
  code: string;
  gold: number;
  items: readonly MailItemAttachment[];
  description: string;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  perAccountLimit: number;
}

type RawAdminCouponRow = {
  code: string;
  gold: number;
  items: unknown;
  description: string;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  per_account_limit: number;
  redeemed_count: number;
  created_at: string;
};

const toAdminCouponRow = (r: RawAdminCouponRow): AdminCouponRow => ({
  code: r.code,
  gold: Number(r.gold),
  items: parseStoredItems(r.items),
  description: r.description,
  active: Boolean(r.active),
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  maxRedemptions: r.max_redemptions === null ? null : Number(r.max_redemptions),
  perAccountLimit: Number(r.per_account_limit),
  redeemedCount: Number(r.redeemed_count),
  createdAt: r.created_at,
});

function parseIsoOrNull(raw: unknown): string | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

export function parseCouponDraft(raw: unknown, op: 'create' | 'update'): CouponDraftInput | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.code !== 'string') return null;
  const code = b.code.trim();
  if (code.length === 0 || code.length > COUPON_CODE_MAX) return null;

  if (typeof b.gold !== 'number' || !Number.isSafeInteger(b.gold) || b.gold < 0 || b.gold > MAIL_GOLD_MAX) {
    return null;
  }
  const items = parseDraftItems(b.items ?? []);
  if (!items) return null;
  if (b.gold === 0 && items.length === 0) return null;

  if (typeof b.description !== 'string') return null;
  const description = b.description.trim();
  if (description.length === 0 || description.length > COUPON_DESC_MAX) return null;

  const active = op === 'create' && b.active === undefined ? true : b.active;
  if (typeof active !== 'boolean') return null;

  const startsAt = op === 'create' && b.startsAt === undefined ? null : parseIsoOrNull(b.startsAt);
  const endsAt = op === 'create' && b.endsAt === undefined ? null : parseIsoOrNull(b.endsAt);
  if (startsAt === undefined || endsAt === undefined) return null;
  if (startsAt !== null && endsAt !== null && Date.parse(startsAt) >= Date.parse(endsAt)) return null;

  const maxRedemptionsRaw = op === 'create' && b.maxRedemptions === undefined ? null : b.maxRedemptions;
  if (
    maxRedemptionsRaw !== null
    && (
      typeof maxRedemptionsRaw !== 'number'
      || !Number.isSafeInteger(maxRedemptionsRaw)
      || maxRedemptionsRaw < 1
      || maxRedemptionsRaw > COUPON_LIMIT_MAX
    )
  ) {
    return null;
  }

  const perAccountLimitRaw = op === 'create' && b.perAccountLimit === undefined ? 1 : b.perAccountLimit;
  if (
    typeof perAccountLimitRaw !== 'number'
    || !Number.isSafeInteger(perAccountLimitRaw)
    || perAccountLimitRaw < 1
    || perAccountLimitRaw > COUPON_LIMIT_MAX
  ) {
    return null;
  }

  return {
    code,
    gold: b.gold,
    items,
    description,
    active,
    startsAt,
    endsAt,
    maxRedemptions: maxRedemptionsRaw,
    perAccountLimit: perAccountLimitRaw,
  };
}

const ADMIN_COUPON_SELECT = sql`c.code,
  c.gold,
  c.items,
  c.description,
  c.active,
  ${isoOf('c.starts_at')} as starts_at,
  ${isoOf('c.ends_at')} as ends_at,
  c.max_redemptions,
  c.per_account_limit,
  (select count(*)::int from public.coupon_redemptions r where r.code = c.code) as redeemed_count,
  to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at`;

/** 관리자용 동적 쿠폰 목록을 최신 생성순으로 조회한다 */
export async function listAdminCoupons(db: Executor): Promise<AdminCouponRow[]> {
  const { rows } = await db.execute<RawAdminCouponRow>(sql`select ${ADMIN_COUPON_SELECT}
    from public.coupons c
    order by c.created_at desc, c.code asc`);
  return rows.map(toAdminCouponRow);
}

/** 관리자용 동적 쿠폰을 생성한다. 코드가 이미 있으면 'duplicate'다 */
export async function createAdminCoupon(
  db: Executor,
  input: CouponDraftInput,
): Promise<AdminCouponRow | 'duplicate'> {
  const startsSql = input.startsAt === null ? sql`null::timestamptz` : at(input.startsAt);
  const endsSql = input.endsAt === null ? sql`null::timestamptz` : at(input.endsAt);
  const { rows } = await db.execute<RawAdminCouponRow>(sql`with ins as (
      insert into public.coupons (code, gold, items, description, active, starts_at, ends_at, max_redemptions, per_account_limit)
      values (
        ${input.code},
        ${input.gold},
        ${JSON.stringify(input.items)}::jsonb,
        ${input.description},
        ${input.active},
        ${startsSql},
        ${endsSql},
        ${input.maxRedemptions},
        ${input.perAccountLimit}
      )
      on conflict (code) do nothing
      returning *
    )
    select ${ADMIN_COUPON_SELECT} from ins c`);
  return rows[0] ? toAdminCouponRow(rows[0]) : 'duplicate';
}

/** 관리자용 동적 쿠폰을 수정한다. 없으면 null이다 */
export async function updateAdminCoupon(
  db: Executor,
  input: CouponDraftInput,
): Promise<AdminCouponRow | null> {
  const startsSql = input.startsAt === null ? sql`null::timestamptz` : at(input.startsAt);
  const endsSql = input.endsAt === null ? sql`null::timestamptz` : at(input.endsAt);
  const { rows } = await db.execute<RawAdminCouponRow>(sql`with upd as (
      update public.coupons set
        gold = ${input.gold},
        items = ${JSON.stringify(input.items)}::jsonb,
        description = ${input.description},
        active = ${input.active},
        starts_at = ${startsSql},
        ends_at = ${endsSql},
        max_redemptions = ${input.maxRedemptions},
        per_account_limit = ${input.perAccountLimit}
      where code = ${input.code}
      returning *
    )
    select ${ADMIN_COUPON_SELECT} from upd c`);
  return rows[0] ? toAdminCouponRow(rows[0]) : null;
}

/** 관리자용 동적 쿠폰을 삭제한다. 없으면 false다 */
export async function deleteAdminCoupon(db: Executor, code: string): Promise<boolean> {
  const res = await db.execute(sql`delete from public.coupons where code = ${code}`);
  return (res.rowCount ?? 0) > 0;
}

// ---------- 지원 코드 ----------

export interface ReliefGrant { gold: number; fame: number; rod: number; boat: number; dex: unknown }

type ReliefRow = { gold: string | number; fame: string | number; rod: number; boat: number; dex: unknown };

const toGrant = (g: ReliefRow | undefined): ReliefGrant | null =>
  g ? { gold: Number(g.gold), fame: Number(g.fame), rod: Number(g.rod), boat: Number(g.boat), dex: g.dex } : null;

/** 아직 쓰지 않은 지원 코드의 지급분 — 읽기만 하고 코드를 소비하지 않는다 */
export async function findRelief(db: Executor, code: string): Promise<ReliefGrant | null> {
  const { rows } = await db.execute<ReliefRow>(sql`select gold, fame, rod, boat, dex from public.reliefs
    where code = ${code} and active`);
  return toGrant(rows[0]);
}

/** 지원 코드 소비 — 활성 코드를 조건부로 비활성화한 요청만 지급분을 받는다(코드당 1행이라 승자가 하나다).
 *  액션 확정과 같은 트랜잭션 안에서 부른다. 확정이 실패하면 함께 되돌려진다 */
export async function consumeRelief(db: Executor, code: string, uid: string): Promise<ReliefGrant | null> {
  const { rows } = await db.execute<ReliefRow>(
    sql`update public.reliefs set active = false, claimed_by = ${uid}
      where code = ${code} and active returning gold, fame, rod, boat, dex`);
  return toGrant(rows[0]);
}
