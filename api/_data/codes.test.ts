// @vitest-environment node
// 동적 쿠폰 입력값 검증(int4 상한 포함) 단위 테스트.
import { describe, expect, it } from 'vitest';
import { COUPON_LIMIT_MAX, parseCouponDraft } from './codes.js';

describe('parseCouponDraft', () => {
  const base = {
    code: 'LIMIT-CHECK',
    gold: 100,
    items: [],
    description: '상한 검증',
  };

  it('maxRedemptions와 perAccountLimit의 int4 최댓값(2_147_483_647)을 허용한다', () => {
    expect(parseCouponDraft({
      ...base,
      maxRedemptions: COUPON_LIMIT_MAX,
      perAccountLimit: COUPON_LIMIT_MAX,
    }, 'create')).toMatchObject({
      code: 'LIMIT-CHECK',
      maxRedemptions: 2_147_483_647,
      perAccountLimit: 2_147_483_647,
    });
  });

  it('maxRedemptions 또는 perAccountLimit가 int4 상한을 넘거나 1 미만이면 null을 돌려준다', () => {
    expect(parseCouponDraft({ ...base, maxRedemptions: 2_147_483_648 }, 'create')).toBeNull();
    expect(parseCouponDraft({ ...base, perAccountLimit: 2_147_483_648 }, 'create')).toBeNull();
    expect(parseCouponDraft({ ...base, maxRedemptions: 0 }, 'create')).toBeNull();
    expect(parseCouponDraft({ ...base, perAccountLimit: 0 }, 'create')).toBeNull();

    const updateBase = {
      ...base,
      active: true,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 10,
      perAccountLimit: 1,
    };
    expect(parseCouponDraft({ ...updateBase, maxRedemptions: 2_147_483_648 }, 'update')).toBeNull();
    expect(parseCouponDraft({ ...updateBase, perAccountLimit: 2_147_483_648 }, 'update')).toBeNull();
  });
});
