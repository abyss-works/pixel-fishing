// 최초 구글 연결 선물 표시 선택자 단위 테스트 — 희귀한 순 품목, 확정 요약 문구, 지속·효과 메타데이터 조합 검증.
import { describe, expect, it } from 'vitest';
import { FIRST_LINK_REWARD_ITEMS } from '../../../game/content/firstLinkReward';
import { selectFirstLinkRewardItems } from './firstLinkReward';

describe('최초 구글 연결 선물 표시 모델', () => {
  it('게임 계약의 품목 순서·수량과 일치하는 3종 표시 항목을 돌려준다', () => {
    const items = selectFirstLinkRewardItems();
    expect(items.map(i => ({ id: i.id, qty: i.qty }))).toEqual([...FIRST_LINK_REWARD_ITEMS]);
    expect(items).toEqual([
      {
        id: 'luck-small',
        spriteKind: 'potion',
        name: '작은 바다 영약',
        grade: 'special',
        qty: 1,
        summaryLine: '하루 동안 희귀 이상, 판매가, 네임드 조우가 조금 올라요.',
        durationLabel: '하루 동안',
        effects: ['모든 행운 효과 ×1.05'],
      },
      {
        id: 'cook-lunch-bundle',
        spriteKind: 'lunch',
        name: '생선 탈리',
        grade: 'legendary',
        qty: 1,
        summaryLine: '방치 낚시 중 입질 대기가 줄고 희귀 이상 출현이 늘어요.',
        durationLabel: '9시간',
        effects: ['입질 대기 −5%', '희귀 이상 +5%'],
      },
      {
        id: 'cook-bait-legendary',
        spriteKind: 'bait',
        name: '용연향 미끼',
        grade: 'legendary',
        qty: 3,
        summaryLine: '수동 낚시에서 전설 어종이 훨씬 잘 낚여요.',
        durationLabel: '5분',
        effects: ['전설 어종 출현 비중 +80%'],
      },
    ]);
  });
});
