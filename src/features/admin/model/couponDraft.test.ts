import { describe, expect, it } from 'vitest';
import {
  MAIL_GOLD_MAX,
  buildCouponRequest,
  couponScopeText,
  couponStatusOf,
  formatCouponRewards,
  nextCouponBoundaryMs,
  searchAttachableItems,
  type CouponDraftForm,
} from './couponDraft';

const baseForm = (overrides: Partial<CouponDraftForm> = {}): CouponDraftForm => ({
  code: 'OPEN2026',
  description: '오픈 기념 지원금',
  gold: '500',
  items: [],
  active: true,
  startsAt: '',
  endsAt: '',
  maxRedemptions: '',
  perAccountLimit: '1',
  ...overrides,
});

describe('couponStatusOf', () => {
  const now = Date.parse('2026-11-27T12:00:00.000Z');

  it('비활성 쿠폰은 기간과 무관하게 비활성이다', () => {
    expect(couponStatusOf({ active: false, startsAt: null, endsAt: null }, now)).toBe('비활성');
    expect(couponStatusOf({
      active: false,
      startsAt: '2026-11-28T00:00:00.000Z',
      endsAt: '2026-11-29T00:00:00.000Z',
    }, now)).toBe('비활성');
  });

  it('활성 쿠폰의 시작·종료 시각에 따라 예약·만료·활성을 판정한다', () => {
    expect(couponStatusOf({ active: true, startsAt: null, endsAt: null }, now)).toBe('활성');
    expect(couponStatusOf({
      active: true,
      startsAt: '2026-11-27T13:00:00.000Z',
      endsAt: '2026-11-28T00:00:00.000Z',
    }, now)).toBe('예약');
    expect(couponStatusOf({
      active: true,
      startsAt: '2026-11-27T10:00:00.000Z',
      endsAt: '2026-11-27T12:00:00.000Z',
    }, now)).toBe('만료');
    expect(couponStatusOf({
      active: true,
      startsAt: '2026-11-27T10:00:00.000Z',
      endsAt: '2026-11-27T14:00:00.000Z',
    }, now)).toBe('활성');
    expect(couponStatusOf({
      active: true,
      startsAt: '2026-11-27T10:00:00.000Z',
      endsAt: null,
    }, now)).toBe('활성');
    expect(couponStatusOf({
      active: true,
      startsAt: null,
      endsAt: '2026-11-27T14:00:00.000Z',
    }, now)).toBe('활성');
  });
});

describe('couponScopeText & formatCouponRewards', () => {
  it('총 사용 한도에 따라 게스트·정식 계정 범위를 반환한다', () => {
    expect(couponScopeText({ maxRedemptions: null })).toBe('무제한 (게스트 가능)');
    expect(couponScopeText({ maxRedemptions: 100 })).toBe('선착순 100명 (정식 계정)');
  });

  it('골드와 첨부 품목을 조합해 보상 요약을 생성한다', () => {
    expect(formatCouponRewards({ gold: 1500, items: [] })).toBe('1,500G');
    expect(formatCouponRewards({ gold: 0, items: [{ id: 'luck-small', qty: 2 }] })).toBe('작은 바다 영약 2개');
    expect(formatCouponRewards({
      gold: 500,
      items: [{ id: 'luck-small', qty: 1 }, { id: 'energy-common', qty: 3 }],
    })).toBe('500G, 작은 바다 영약 1개, 일반 생명의 기운 3개');
    expect(formatCouponRewards({ gold: 0, items: [] })).toBe('-');
  });
});

describe('nextCouponBoundaryMs', () => {
  it('앞으로 다가올 시작·종료 시각 중 가장 가까운 남은 시간을 돌려준다', () => {
    const now = Date.parse('2026-11-27T12:00:00.000Z');
    expect(nextCouponBoundaryMs([
      { active: false, startsAt: '2026-11-27T12:05:00.000Z', endsAt: null },
      { active: true, startsAt: '2026-11-27T12:10:00.000Z', endsAt: '2026-11-27T13:00:00.000Z' },
    ], now)).toBe(600_000);
    expect(nextCouponBoundaryMs([{ active: true, startsAt: null, endsAt: null }], now)).toBeNull();
  });
});

describe('buildCouponRequest', () => {
  it('유효한 입력으로 create 및 update 요청을 생성한다', () => {
    const created = buildCouponRequest(baseForm({
      code: '  FALL2026  ',
      description: '  가을 출항 보상  ',
      gold: '1000',
      items: [{ id: 'luck-small', qty: 2 }],
    }), 'create');
    expect(created).toEqual({
      ok: true,
      request: {
        op: 'create',
        code: 'FALL2026',
        description: '가을 출항 보상',
        gold: 1000,
        items: [{ id: 'luck-small', qty: 2 }],
        active: true,
        startsAt: null,
        endsAt: null,
        maxRedemptions: null,
        perAccountLimit: 1,
      },
    });

    const updated = buildCouponRequest(baseForm({
      gold: '0',
      items: [{ id: 'energy-common', qty: 5 }],
      active: false,
      startsAt: '2026-11-27T10:00',
      endsAt: '2026-11-28T10:00',
      maxRedemptions: '50',
      perAccountLimit: '2',
    }), 'update');
    expect(updated).toEqual({
      ok: true,
      request: {
        op: 'update',
        code: 'OPEN2026',
        description: '오픈 기념 지원금',
        gold: 0,
        items: [{ id: 'energy-common', qty: 5 }],
        active: false,
        startsAt: new Date('2026-11-27T10:00').toISOString(),
        endsAt: new Date('2026-11-28T10:00').toISOString(),
        maxRedemptions: 50,
        perAccountLimit: 2,
      },
    });
  });

  it('코드 길이와 정적 COUPONS 키 충돌을 거부한다', () => {
    expect(buildCouponRequest(baseForm({ code: '   ' }), 'create').ok).toBe(false);
    expect(buildCouponRequest(baseForm({ code: 'A'.repeat(65) }), 'create').ok).toBe(false);
    const staticCollision = buildCouponRequest(baseForm({ code: '출항준비' }), 'create');
    expect(staticCollision.ok).toBe(false);
  });

  it('설명 길이(1~200자)를 검증한다', () => {
    expect(buildCouponRequest(baseForm({ description: ' ' }), 'create').ok).toBe(false);
    expect(buildCouponRequest(baseForm({ description: '가'.repeat(201) }), 'create').ok).toBe(false);
  });

  it('골드 범위(0..MAIL_GOLD_MAX 정수)와 빈 보상(gold===0 && items===0)을 검증한다', () => {
    expect(buildCouponRequest(baseForm({ gold: '-1' }), 'create').ok).toBe(false);
    expect(buildCouponRequest(baseForm({ gold: '1.5' }), 'create').ok).toBe(false);
    expect(buildCouponRequest(baseForm({ gold: String(MAIL_GOLD_MAX + 1) }), 'create').ok).toBe(false);
    expect(buildCouponRequest(baseForm({ gold: String(MAIL_GOLD_MAX) }), 'create').ok).toBe(true);
    expect(buildCouponRequest(baseForm({ gold: '0', items: [] }), 'create').ok).toBe(false);
  });

  it('시작·종료 시각과 사용 한도를 검증한다', () => {
    expect(buildCouponRequest(baseForm({
      startsAt: '2026-11-28T10:00',
      endsAt: '2026-11-28T10:00',
    }), 'create').ok).toBe(false);
    expect(buildCouponRequest(baseForm({
      startsAt: '2026-11-29T10:00',
      endsAt: '2026-11-28T10:00',
    }), 'create').ok).toBe(false);
    expect(buildCouponRequest(baseForm({ startsAt: 'not-a-date' }), 'create').ok).toBe(false);
    expect(buildCouponRequest(baseForm({ startsAt: '2026-11-28T10:00', endsAt: '' }), 'create').ok).toBe(true);

    expect(buildCouponRequest(baseForm({ maxRedemptions: '0' }), 'create').ok).toBe(false);
    expect(buildCouponRequest(baseForm({ maxRedemptions: '1.5' }), 'create').ok).toBe(false);
    expect(buildCouponRequest(baseForm({ perAccountLimit: '' }), 'create').ok).toBe(false);
    expect(buildCouponRequest(baseForm({ perAccountLimit: '0' }), 'create').ok).toBe(false);
  });

  it('품목 검색은 모자를 제외하고 스택 아이템만 찾는다', () => {
    expect(searchAttachableItems('산타')).toEqual([]);
    expect(searchAttachableItems('비약').length).toBeGreaterThan(0);
  });
});
