import { describe, expect, it } from 'vitest';
import type { MailItem } from '../../../platform/api';
import { isClaimable, isPending, pendingCount } from './mailbox';

const mail = (over: Partial<MailItem>): MailItem => ({
  id: 1, title: 't', body: 'b', gold: 0, createdAt: '2026-10-23T00:00:00.000Z', readAt: null, claimedAt: null, ...over,
});
const AT = '2026-10-23T01:00:00.000Z';

describe('우편함 모델', () => {
  it('골드 우편은 받기 전까지, 글 우편은 읽기 전까지 할 일이 남아 있다', () => {
    expect(isPending(mail({ gold: 100, readAt: AT }))).toBe(true);
    expect(isPending(mail({ gold: 100, readAt: AT, claimedAt: AT }))).toBe(false);
    expect(isPending(mail({}))).toBe(true);
    expect(isPending(mail({ readAt: AT }))).toBe(false);
  });

  it('받을 수 있는 우편은 골드가 있고 아직 받지 않은 우편이다', () => {
    expect(isClaimable(mail({ gold: 100 }))).toBe(true);
    expect(isClaimable(mail({ gold: 100, claimedAt: AT }))).toBe(false);
    expect(isClaimable(mail({}))).toBe(false);
  });

  it('할 일이 남은 우편 수를 센다', () => {
    expect(pendingCount([mail({ gold: 5 }), mail({ readAt: AT }), mail({})])).toBe(2);
  });
});
