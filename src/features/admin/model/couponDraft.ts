import { COUPONS } from '../../../game/content/coupons';
import { fmtGold } from '../../../shared/lib/format';
import {
  MAIL_GOLD_MAX,
  STACKABLE_ITEM_KIND_LABEL,
  findStackableItem,
  formatItemQtyText,
  formatMailItemsSummary,
  removeMailAttachment,
  searchAttachableItems,
  upsertMailAttachment,
  type MailItemAttachment,
} from './mailDraft';
import type { AdminCouponRequest, AdminCouponRow } from './types';

export {
  MAIL_GOLD_MAX,
  STACKABLE_ITEM_KIND_LABEL,
  findStackableItem,
  formatItemQtyText,
  formatMailItemsSummary,
  removeMailAttachment,
  searchAttachableItems,
  upsertMailAttachment,
};
export type { MailItemAttachment };

export const COUPON_CODE_MAX = 64;
export const COUPON_DESC_MAX = 200;

export type CouponStatus = '비활성' | '예약' | '만료' | '활성';

export interface CouponDraftForm {
  code: string;
  description: string;
  gold: string | number;
  items: readonly MailItemAttachment[];
  active: boolean;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string | number | null;
  perAccountLimit: string | number;
}

export type CouponDraftResult =
  | { ok: true; request: Extract<AdminCouponRequest, { op: 'create' | 'update' }> }
  | { ok: false; error: string };

/** 쿠폰의 활성 여부와 유효 기간으로 현재 상태를 판정한다. */
export function couponStatusOf(
  coupon: Pick<AdminCouponRow, 'active' | 'startsAt' | 'endsAt'>,
  nowMs: number,
): CouponStatus {
  if (!coupon.active) return '비활성';
  const start = coupon.startsAt ? Date.parse(coupon.startsAt) : NaN;
  if (Number.isFinite(start) && nowMs < start) return '예약';
  const end = coupon.endsAt ? Date.parse(coupon.endsAt) : NaN;
  if (Number.isFinite(end) && nowMs >= end) return '만료';
  return '활성';
}

/** 쿠폰의 수령 대상과 선착순 한도 안내 문구를 만든다. */
export function couponScopeText(coupon: Pick<AdminCouponRow, 'maxRedemptions'>): string {
  return coupon.maxRedemptions === null
    ? '무제한 (게스트 가능)'
    : `선착순 ${coupon.maxRedemptions}명 (정식 계정)`;
}

/** 쿠폰의 보상 골드와 첨부 품목 요약 문구를 만든다. */
export function formatCouponRewards(coupon: Pick<AdminCouponRow, 'gold' | 'items'>): string {
  const parts: string[] = [];
  if (coupon.gold > 0) parts.push(fmtGold(coupon.gold));
  if (coupon.items.length > 0) parts.push(formatMailItemsSummary(coupon.items));
  return parts.length > 0 ? parts.join(', ') : '-';
}

/** 다음 활성 또는 만료 경계까지 남은 시간(ms)을 구한다. 예정된 경계가 없으면 null을 돌려준다. */
export function nextCouponBoundaryMs(
  coupons: readonly Pick<AdminCouponRow, 'active' | 'startsAt' | 'endsAt'>[],
  nowMs: number,
): number | null {
  let nextBoundary: number | null = null;
  for (const coupon of coupons) {
    if (!coupon.active) continue;
    for (const raw of [coupon.startsAt, coupon.endsAt]) {
      if (!raw) continue;
      const ms = Date.parse(raw);
      if (!Number.isFinite(ms) || ms <= nowMs) continue;
      if (nextBoundary === null || ms < nextBoundary) nextBoundary = ms;
    }
  }
  return nextBoundary === null ? null : nextBoundary - nowMs;
}

function parseOptionalIso(raw: string): { ok: true; iso: string | null; ms: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, iso: null, ms: null };
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return { ok: false };
  return { ok: true, iso: new Date(ms).toISOString(), ms };
}

function parseNonNegativeInt(raw: string | number, emptyFallback: number): number {
  if (typeof raw === 'number') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return emptyFallback;
  return Number(trimmed);
}

/** 쿠폰 발행·수정 폼 입력을 검증하고 요청 본문으로 변환한다. */
export function buildCouponRequest(
  form: CouponDraftForm,
  mode: 'create' | 'update',
): CouponDraftResult {
  const code = form.code.trim();
  if (code.length < 1 || code.length > COUPON_CODE_MAX) {
    return { ok: false, error: `쿠폰 코드는 1자 이상 ${COUPON_CODE_MAX}자 이하로 입력해 주세요.` };
  }
  if (Object.hasOwn(COUPONS, code)) {
    return { ok: false, error: '정적 쿠폰과 겹치는 코드는 사용할 수 없어요.' };
  }

  const description = form.description.trim();
  if (description.length < 1 || description.length > COUPON_DESC_MAX) {
    return { ok: false, error: `설명은 1자 이상 ${COUPON_DESC_MAX}자 이하로 입력해 주세요.` };
  }

  const gold = parseNonNegativeInt(form.gold, 0);
  if (!Number.isSafeInteger(gold) || gold < 0 || gold > MAIL_GOLD_MAX) {
    return { ok: false, error: '보상 골드는 0 이상 10억 이하의 정수로 입력해 주세요.' };
  }

  const items: MailItemAttachment[] = [];
  for (const entry of form.items) {
    const validated = upsertMailAttachment(items, entry.id, entry.qty);
    if (validated.error) return { ok: false, error: validated.error };
    items.splice(0, items.length, ...validated.items);
  }

  if (gold === 0 && items.length === 0) {
    return { ok: false, error: '보상 골드나 첨부 품목 중 하나 이상을 입력해 주세요.' };
  }

  const start = parseOptionalIso(form.startsAt);
  const end = parseOptionalIso(form.endsAt);
  if (!start.ok || !end.ok) {
    return { ok: false, error: '시작 시각이나 종료 시각 형식이 올바르지 않아요.' };
  }
  if (start.ms !== null && end.ms !== null && start.ms >= end.ms) {
    return { ok: false, error: '종료 시각은 시작 시각보다 뒤여야 해요.' };
  }

  let maxRedemptions: number | null = null;
  if (form.maxRedemptions !== null && String(form.maxRedemptions).trim() !== '') {
    const parsedMax = parseNonNegativeInt(form.maxRedemptions, NaN);
    if (!Number.isSafeInteger(parsedMax) || parsedMax < 1) {
      return { ok: false, error: '총 사용 한도는 비워 두거나 1 이상의 정수로 입력해 주세요.' };
    }
    maxRedemptions = parsedMax;
  }

  const perAccountLimit = parseNonNegativeInt(form.perAccountLimit, NaN);
  if (!Number.isSafeInteger(perAccountLimit) || perAccountLimit < 1) {
    return { ok: false, error: '계정당 사용 한도는 1 이상의 정수로 입력해 주세요.' };
  }

  const payload = {
    code,
    gold,
    items,
    description,
    active: form.active,
    startsAt: start.iso,
    endsAt: end.iso,
    maxRedemptions,
    perAccountLimit,
  };

  return {
    ok: true,
    request: mode === 'create' ? { op: 'create', ...payload } : { op: 'update', ...payload },
  };
}
