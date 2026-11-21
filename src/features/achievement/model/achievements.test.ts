import { describe, it, expect } from 'vitest';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import {
  ACHIEVEMENT_TABS,
  achievementRowById,
  achievementRows,
  achievementSummary,
  activeBonusChips,
  canClaim,
  claimableCount,
  cosmeticCards,
  cumulativeBonusCards,
  newlyClaimable,
  rowStatusOf,
  tabClaimableCount,
} from './achievements';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

describe('탭', () => {
  it('탭 순서는 진행, 누적 보너스, 치장 셋이다', () => {
    expect(ACHIEVEMENT_TABS.map(t => t.key)).toEqual(['progress', 'bonus', 'cosmetic']);
    expect(ACHIEVEMENT_TABS.map(t => t.label)).toEqual(['진행', '누적 보너스', '치장']);
  });
});

describe('행 상태', () => {
  it('저장이 없으면 진행 중, claimable이면 받을 수 있음, claimed면 받음이다', () => {
    expect(rowStatusOf(seed(), 'big-50')).toBe('progress');
    expect(rowStatusOf(seed({ achievements: { 'big-50': 'claimable' } }), 'big-50')).toBe('claimable');
    expect(rowStatusOf(seed({ achievements: { 'big-50': 'claimed' } }), 'big-50')).toBe('claimed');
  });
});

describe('행 진척', () => {
  it('진척은 규칙 판정의 현재와 목표다', () => {
    const row = achievementRowById(seed(), 'big-50')!;
    expect(row.progress).toEqual({ current: 0, target: 50 });
    expect(row.status).toBe('progress');
  });
  it('모르는 id는 행을 만들지 않는다', () => {
    expect(achievementRowById(seed(), 'no-such')).toBeUndefined();
  });
});

describe('탭 목록 정렬', () => {
  it('받을 수 있는 업적이 맨 위, 그 아래 진행 중, 마지막에 받은 순이다', () => {
    const state = seed({
      achievements: {
        'spot-basic-pond': 'claimed',
        'spot-full-sea': 'claimable',
      },
    });
    const rows = achievementRows(state, 'progress');
    expect(rows[0].def.id).toBe('spot-full-sea');
    expect(rows[0].status).toBe('claimable');
    expect(rows[rows.length - 1].def.id).toBe('spot-basic-pond');
    expect(rows[rows.length - 1].status).toBe('claimed');
  });
  it('같은 상태 안에서는 정의 순서를 지킨다', () => {
    const rows = achievementRows(seed(), 'progress');
    expect(rows).toHaveLength(26);
    expect(rows[0].def.id).toBe('spot-basic-pond');
    expect(rows[rows.length - 1].def.id).toBe('spot-full-sthelena');
  });
});

describe('요약 줄', () => {
  it('받을 골드와 모자를 claimable 업적의 보상으로 합산하고 받은 수를 센다', () => {
    const state = seed({
      achievements: {
        'spot-basic-sea': 'claimable',
        'variant-village': 'claimable',
        'spot-full-sea': 'claimed',
      },
    });
    expect(achievementSummary(state)).toEqual({ claimed: 1, total: 67, gold: 300, hats: 1, canClaimAll: true });
    expect(tabClaimableCount(state, 'progress')).toBe(1);
    expect(tabClaimableCount(state, 'bonus')).toBe(0);
    expect(tabClaimableCount(state, 'cosmetic')).toBe(1);
  });
  it('받을 수 있는 업적이 없으면 모두 받기는 거짓이다', () => {
    expect(achievementSummary(seed())).toMatchObject({ gold: 0, hats: 0, canClaimAll: false });
  });
  it('게스트는 받을 수 있는 업적이 있어도 모두 받기가 거짓이다', () => {
    const state = seed({ achievements: { 'spot-basic-sea': 'claimable' } });
    expect(achievementSummary(state, true).canClaimAll).toBe(false);
  });
  it('메뉴 배지 수와 요약 줄의 받을 수 있는 수는 같다', () => {
    const state = seed({ achievements: { 'spot-basic-sea': 'claimable', 'variant-village': 'claimable' } });
    expect(claimableCount(state)).toBe(2);
  });
});

describe('누적 보너스 카드와 상단 칩 바', () => {
  it('21개 다단계 누적 보너스 카드를 생성하고 적용 중인 보너스만 칩 바로 묶는다', () => {
    expect(activeBonusChips(seed())).toEqual([]);
    const boosted = seed({
      achievementCounters: {
        'manual.total': 1_000,
        'sell.gold': 10_000_000,
        'named.flawless': 1,
      },
    });
    const cards = cumulativeBonusCards(boosted);
    expect(cards).toHaveLength(21);
    const manual = cards.find(c => c.series.id === 'bonus-manual-total')!;
    expect(manual.steps.map(s => s.state)).toEqual(['done', 'done', 'done', 'now']);
    expect(manual.activeText).toBe('입질 대기 −2%');

    const chips = activeBonusChips(boosted);
    expect(chips.map(c => [c.id, c.valueText])).toEqual([
      ['biteWaitCut', '−2%'],
      ['namedWeight', '+3%'],
      ['moveSpeed', '+4%'],
    ]);
  });
});

describe('치장 다단계 카드와 스포일러 가림', () => {
  it('미토벌 네임드는 실명을 가리고 출현 해역·구역 이름으로 표기한다', () => {
    const namedCards = cosmeticCards(seed(), 'named');
    expect(namedCards).toHaveLength(6);
    const mega = namedCards.find(c => c.kind === 'namedGroup' && c.namedId === 'megalodon');
    expect(mega?.kind).toBe('namedGroup');
    if (mega?.kind === 'namedGroup') {
      expect(mega.title).toBe('태평양 네임드 토벌');
      expect(mega.title).not.toContain('메갈로돈');
      expect(mega.desc).not.toContain('메갈로돈');
      expect(mega.steps).toHaveLength(3);
    }
  });

  it('1회 이상 토벌한 네임드는 실명을 드러내고 claimable 단계를 앞으로 띄운다', () => {
    const state = seed({
      clearedNamed: ['pacific-named-megalodon'],
      achievements: { 'named-megalodon-1': 'claimable' },
    });
    const namedCards = cosmeticCards(state, 'named');
    const first = namedCards[0];
    expect(first.kind).toBe('namedGroup');
    if (first.kind === 'namedGroup') {
      expect(first.namedId).toBe('megalodon');
      expect(first.title).toBe('메갈로돈 토벌');
      expect(first.status).toBe('claimable');
      expect(first.activeRow.def.id).toBe('named-megalodon-1');
    }
  });
});

describe('새로 받을 수 있게 된 업적 감지', () => {
  it('이전에 없거나 진행 중이던 업적이 claimable이 되면 이름표를 뽑는다', () => {
    const before = seed({ achievements: { 'variant-village': 'claimable', 'catch-100000': 'claimed' } });
    const after = seed({
      achievements: {
        'variant-village': 'claimable',
        'catch-100000': 'claimed',
        'spot-basic-sea': 'claimable',
        'big-50': 'claimable',
      },
    });
    expect(newlyClaimable(before, after)).toEqual(['태평양 연안 기초', '월척 장부']);
  });
  it('이미 claimable이거나 받기로 바뀐 업적은 새 업적이 아니다', () => {
    const before = seed({ achievements: { 'spot-basic-sea': 'claimable' } });
    const after = seed({ achievements: { 'spot-basic-sea': 'claimed' } });
    expect(newlyClaimable(before, after)).toEqual([]);
  });
  it('모르는 id가 새로 claimable이 돼도 이름표를 지어내지 않는다', () => {
    const before = seed();
    const after = seed({ achievements: { 'no-such': 'claimable' } });
    expect(newlyClaimable(before, after)).toEqual([]);
  });
});

describe('받기 버튼 판정', () => {
  it('claimable이 아니면 받을 수 없다', () => {
    expect(canClaim(seed(), 'spot-basic-sea')).toBe(false);
    expect(canClaim(seed({ achievements: { 'spot-basic-sea': 'claimable' } }), 'spot-basic-sea')).toBe(true);
  });
  it('게스트는 claimable이어도 받을 수 없다', () => {
    const state = seed({ achievements: { 'spot-basic-sea': 'claimable' } });
    expect(canClaim(state, 'spot-basic-sea', true)).toBe(false);
  });
});
