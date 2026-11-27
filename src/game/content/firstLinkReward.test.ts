import { describe, expect, it } from 'vitest';
import {
  FIRST_LINK_REWARD_ITEMS,
  FIRST_LINK_REWARD_KEY,
  FIRST_LINK_REWARD_MAIL,
} from './firstLinkReward';
import { isAttachableItemId } from './itemCatalog';

describe('최초 구글 연결 선물 계약 상수', () => {
  it('멱등 키·첨부 품목 3종·우편 제목과 본문이 확정 계약과 일치한다', () => {
    expect(FIRST_LINK_REWARD_KEY).toBe('google-first-link-reward');
    expect(FIRST_LINK_REWARD_ITEMS).toEqual([
      { id: 'luck-small', qty: 1 },
      { id: 'cook-lunch-bundle', qty: 1 },
      { id: 'cook-bait-legendary', qty: 3 },
    ]);
    expect(FIRST_LINK_REWARD_MAIL).toEqual({
      title: '출항 연결 선물',
      body: '구글 계정을 처음 연결해 출항 준비 선물을 보냈어요. 작은 바다 영약, 생선 탈리, 용연향 미끼를 가방의 아이템 탭에서 사용해 보세요.',
    });
  });

  it('첨부 품목의 모든 id가 우편 첨부 가능 아이템 카탈로그(isAttachableItemId)를 통과한다', () => {
    for (const item of FIRST_LINK_REWARD_ITEMS) {
      expect(isAttachableItemId(item.id), item.id).toBe(true);
      expect(Number.isInteger(item.qty) && item.qty > 0, item.id).toBe(true);
    }
  });
});
