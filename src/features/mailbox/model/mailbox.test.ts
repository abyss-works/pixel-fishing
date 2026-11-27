import { describe, expect, it } from 'vitest';
import type { MailItem } from '../../../platform/api';
import {
  claimMailNoticeText,
  claimMailToastText,
  hasReward,
  isClaimable,
  isPending,
  mailRewardSummary,
  pendingCount,
} from './mailbox';

const mail = (over: Partial<MailItem>): MailItem => ({
  id: 1, title: 't', body: 'b', gold: 0, items: [], createdAt: '2026-10-23T00:00:00.000Z', readAt: null, claimedAt: null, ...over,
});
const AT = '2026-10-23T01:00:00.000Z';

describe('우편함 모델', () => {
  it('골드·아이템·모자 우편은 받기 전까지, 글 우편은 읽기 전까지 할 일이 남아 있다', () => {
    expect(isPending(mail({ gold: 100, readAt: AT }))).toBe(true);
    expect(isPending(mail({ gold: 100, readAt: AT, claimedAt: AT }))).toBe(false);
    expect(isPending(mail({ items: [{ id: 'luck-small', qty: 2 }], readAt: AT }))).toBe(true);
    expect(isPending(mail({ items: [{ id: 'luck-small', qty: 2 }], readAt: AT, claimedAt: AT }))).toBe(false);
    expect(isPending(mail({ hats: ['santa-hat'], readAt: AT }))).toBe(true);
    expect(isPending(mail({ hats: ['santa-hat'], readAt: AT, claimedAt: AT }))).toBe(false);
    expect(isPending(mail({}))).toBe(true);
    expect(isPending(mail({ readAt: AT }))).toBe(false);
  });

  it('받을 수 있는 우편은 골드·아이템·모자 중 하나 이상이 있고 아직 받지 않은 우편이다', () => {
    expect(hasReward(mail({ items: [{ id: 'luck-small', qty: 1 }] }))).toBe(true);
    expect(hasReward(mail({ hats: ['santa-hat'] }))).toBe(true);
    expect(hasReward(mail({ hats: [] }))).toBe(false);
    expect(hasReward(mail({}))).toBe(false);
    expect(isClaimable(mail({ gold: 100 }))).toBe(true);
    expect(isClaimable(mail({ items: [{ id: 'luck-small', qty: 2 }] }))).toBe(true);
    expect(isClaimable(mail({ hats: ['santa-hat'] }))).toBe(true);
    expect(isClaimable(mail({ hats: ['santa-hat'], claimedAt: AT }))).toBe(false);
    expect(isClaimable(mail({ items: [{ id: 'luck-small', qty: 2 }], claimedAt: AT }))).toBe(false);
    expect(isClaimable(mail({ gold: 100, claimedAt: AT }))).toBe(false);
    expect(isClaimable(mail({}))).toBe(false);
  });

  it('목록 요약 문구는 골드, 아이템, 모자, 복합 보상을 구분한다', () => {
    expect(mailRewardSummary(mail({ hats: ['santa-hat'] }))).toBe('산타모자');
    expect(mailRewardSummary(mail({ hats: ['santa-hat', 'cap-red'] }))).toBe('산타모자 외 1종');
    expect(mailRewardSummary(mail({ gold: 500, hats: ['santa-hat'] }))).toBe('500G 외 1종');
    expect(mailRewardSummary(mail({ items: [{ id: 'luck-small', qty: 2 }], hats: ['santa-hat'] }))).toBe('작은 바다 영약 외 1종');
  });

  it('수령 안내 문구와 토스트 문구는 골드, 아이템, 모자, 복합 보상을 구분한다', () => {
    expect(claimMailNoticeText(mail({ gold: 6309483 }))).toBe('우편에서 6,309,483G를 받았어요!');
    expect(claimMailNoticeText(mail({ items: [{ id: 'luck-small', qty: 2 }] }))).toBe('우편에서 작은 바다 영약 2개를 받았어요!');
    expect(claimMailNoticeText(mail({ gold: 500, items: [{ id: 'luck-small', qty: 2 }] }))).toBe(
      '우편에서 500G, 작은 바다 영약 2개를 받았어요!',
    );
    expect(claimMailNoticeText(mail({ hats: ['santa-hat'] }))).toBe(
      '산타모자 선물을 받았어요! 집의 옷장에서 쓸 수 있어요.',
    );
    expect(claimMailToastText(mail({ hats: ['santa-hat'] }))).toBe(
      '산타모자 선물을 받았어요! 집의 옷장에서 쓸 수 있어요.',
    );
    expect(claimMailNoticeText(mail({ gold: 500, hats: ['santa-hat'] }))).toBe(
      '우편에서 500G, 산타모자를 받았어요! 집의 옷장에서 쓸 수 있어요.',
    );
    expect(claimMailToastText(mail({ gold: 500, hats: ['santa-hat'] }))).toBe('우편 500G, 산타모자 수령!');
  });

  it('할 일이 남은 우편 수를 센다', () => {
    expect(pendingCount([
      mail({ gold: 5 }),
      mail({ items: [{ id: 'luck-small', qty: 1 }] }),
      mail({ hats: ['santa-hat'] }),
      mail({ readAt: AT }),
      mail({}),
    ])).toBe(4);
  });
});
