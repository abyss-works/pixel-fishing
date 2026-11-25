import { describe, expect, it } from 'vitest';
import type { MailItem } from '../../../platform/api';
import { claimMailNoticeText, hasReward, isClaimable, isPending, pendingCount } from './mailbox';

const mail = (over: Partial<MailItem>): MailItem => ({
  id: 1, title: 't', body: 'b', gold: 0, items: [], createdAt: '2026-10-23T00:00:00.000Z', readAt: null, claimedAt: null, ...over,
});
const AT = '2026-10-23T01:00:00.000Z';

describe('우편함 모델', () => {
  it('골드·아이템 우편은 받기 전까지, 글 우편은 읽기 전까지 할 일이 남아 있다', () => {
    expect(isPending(mail({ gold: 100, readAt: AT }))).toBe(true);
    expect(isPending(mail({ gold: 100, readAt: AT, claimedAt: AT }))).toBe(false);
    expect(isPending(mail({ items: [{ id: 'luck-small', qty: 2 }], readAt: AT }))).toBe(true);
    expect(isPending(mail({ items: [{ id: 'luck-small', qty: 2 }], readAt: AT, claimedAt: AT }))).toBe(false);
    expect(isPending(mail({}))).toBe(true);
    expect(isPending(mail({ readAt: AT }))).toBe(false);
  });

  it('받을 수 있는 우편은 골드 또는 아이템이 있고 아직 받지 않은 우편이다', () => {
    expect(hasReward(mail({ items: [{ id: 'luck-small', qty: 1 }] }))).toBe(true);
    expect(hasReward(mail({}))).toBe(false);
    expect(isClaimable(mail({ gold: 100 }))).toBe(true);
    expect(isClaimable(mail({ items: [{ id: 'luck-small', qty: 2 }] }))).toBe(true);
    expect(isClaimable(mail({ items: [{ id: 'luck-small', qty: 2 }], claimedAt: AT }))).toBe(false);
    expect(isClaimable(mail({ gold: 100, claimedAt: AT }))).toBe(false);
    expect(isClaimable(mail({}))).toBe(false);
  });

  it('수령 안내 문구는 골드, 아이템, 복합 보상을 구분한다', () => {
    expect(claimMailNoticeText(mail({ gold: 6309483 }))).toBe('우편에서 6,309,483G를 받았어요!');
    expect(claimMailNoticeText(mail({ items: [{ id: 'luck-small', qty: 2 }] }))).toBe('우편에서 작은 바다 영약 2개를 받았어요!');
    expect(claimMailNoticeText(mail({ gold: 500, items: [{ id: 'luck-small', qty: 2 }] }))).toBe(
      '우편에서 500G, 작은 바다 영약 2개를 받았어요!',
    );
  });

  it('할 일이 남은 우편 수를 센다', () => {
    expect(pendingCount([mail({ gold: 5 }), mail({ items: [{ id: 'luck-small', qty: 1 }] }), mail({ readAt: AT }), mail({})])).toBe(3);
  });
});
