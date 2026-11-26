import { describe, expect, it } from 'vitest';
import {
  EVENT2_SETTLEMENT_RATES,
  EVENT_FISH,
  EVENT_HAT_IDS,
  eventFishById,
} from '../content/eventFish';
import {
  computeEvent2CatchScore,
  computeSettlementReward,
  matchTrioSlot,
  nextUnlockedEventHats,
  rollEvent2Catch,
} from './events';

describe('matchTrioSlot', () => {
  it('어종 id와 형태가 정확히 일치할 때만 참을 반환한다', () => {
    expect(matchTrioSlot({ fishId: 'mackerel', form: 'normal' }, 'mackerel', 'normal')).toBe(true);
    expect(matchTrioSlot({ fishId: 'mackerel', form: 'normal' }, 'mackerel', 'variant')).toBe(false);
    expect(matchTrioSlot({ fishId: 'mackerel', form: 'variant' }, 'mackerel', 'normal')).toBe(false);
    expect(matchTrioSlot({ fishId: 'mackerel', form: 'variant' }, 'mackerel', 'variant')).toBe(true);
    expect(matchTrioSlot({ fishId: 'mackerel', form: 'normal' }, 'squid', 'normal')).toBe(false);
  });

  it('이벤트 2 구역(championship) 또는 이벤트 전용 어종은 삼총사 달성에서 제외한다', () => {
    expect(matchTrioSlot({ fishId: 'mackerel', form: 'normal' }, 'mackerel', 'normal', 'sea')).toBe(true);
    expect(matchTrioSlot({ fishId: 'mackerel', form: 'normal' }, 'mackerel', 'normal', 'championship')).toBe(false);
    expect(matchTrioSlot({ fishId: 'event-boxfish', form: 'normal' }, 'event-boxfish', 'normal')).toBe(false);
  });
});

describe('computeEvent2CatchScore', () => {
  it('전용 어종 9종의 일반·돌연변이 점수를 정본대로 계산한다', () => {
    for (const fish of EVENT_FISH) {
      expect(computeEvent2CatchScore(fish, 'normal')).toBe(fish.score);
      expect(computeEvent2CatchScore(fish, 'variant')).toBe(fish.variant.score);
      expect(computeEvent2CatchScore(fish.id, 'normal')).toBe(fish.score);
      expect(computeEvent2CatchScore(fish.id, 'variant')).toBe(fish.variant.score);
    }
    expect(computeEvent2CatchScore('event-glaaki', 'normal')).toBe(400);
    expect(computeEvent2CatchScore('event-glaaki', 'variant')).toBe(800);
    expect(computeEvent2CatchScore('unknown-fish', 'normal')).toBe(0);
  });
});

describe('computeSettlementReward', () => {
  it('배 0~9단계와 수동·방치 여부에 따라 10점당 골드·고정 명성을 정확히 환산한다', () => {
    for (let tier = 0; tier <= 9; tier++) {
      expect(computeSettlementReward(10, tier, false)).toEqual({
        gold: EVENT2_SETTLEMENT_RATES.idle[tier],
        fame: EVENT2_SETTLEMENT_RATES.fame,
      });
      expect(computeSettlementReward(10, tier, true)).toEqual({
        gold: EVENT2_SETTLEMENT_RATES.manual[tier],
        fame: EVENT2_SETTLEMENT_RATES.fame,
      });
    }
    expect(computeSettlementReward(800, 9, true)).toEqual({
      gold: 80 * 55027,
      fame: 80 * 4,
    });
  });

  it('경계값·비정상 입력은 안전하게 클램프하거나 0을 반환한다', () => {
    expect(computeSettlementReward(0, 3, true)).toEqual({ gold: 0, fame: 0 });
    expect(computeSettlementReward(-50, 3, false)).toEqual({ gold: 0, fame: 0 });
    expect(computeSettlementReward(Number.NaN, 3, true)).toEqual({ gold: 0, fame: 0 });
    expect(computeSettlementReward(10, -2, false)).toEqual({ gold: EVENT2_SETTLEMENT_RATES.idle[0], fame: 4 });
    expect(computeSettlementReward(10, 99, true)).toEqual({ gold: EVENT2_SETTLEMENT_RATES.manual[9], fame: 4 });
    expect(computeSettlementReward(15, 0, false)).toEqual({ gold: 13, fame: 6 });
  });
});

describe('nextUnlockedEventHats', () => {
  const fullNormalDex = () => Object.fromEntries(EVENT_FISH.map(f => [f.id, { normal: 1, variant: 0 }]));
  const fullVariantDex = () => Object.fromEntries(EVENT_FISH.map(f => [f.id, { normal: 0, variant: 1 }]));

  it('도감 9종을 모두 채우기 전에는 지급할 모자가 없다', () => {
    const partial = fullNormalDex();
    partial['event-glaaki'] = { normal: 0, variant: 0 };
    expect(nextUnlockedEventHats(partial, [])).toEqual([]);
  });

  it('일반 9/9 달성 시 삿갓을, 변이 9/9 달성 시 왕관을 중복 없이 지급한다', () => {
    expect(nextUnlockedEventHats(fullNormalDex(), [])).toEqual([EVENT_HAT_IDS.normal]);
    expect(nextUnlockedEventHats(fullNormalDex(), [EVENT_HAT_IDS.normal])).toEqual([]);
    expect(nextUnlockedEventHats(fullVariantDex(), [])).toEqual([EVENT_HAT_IDS.variant]);
    expect(nextUnlockedEventHats(fullVariantDex(), [EVENT_HAT_IDS.variant])).toEqual([]);

    const both = Object.fromEntries(EVENT_FISH.map(f => [f.id, { normal: 1, variant: 1 }]));
    expect(nextUnlockedEventHats(both, [])).toEqual([EVENT_HAT_IDS.normal, EVENT_HAT_IDS.variant]);
    expect(nextUnlockedEventHats(both, [EVENT_HAT_IDS.normal])).toEqual([EVENT_HAT_IDS.variant]);
  });
});

describe('rollEvent2Catch', () => {
  it('표준 스펙으로 전용 어종과 25% 돌연변이를 결정적으로 추첨한다', () => {
    const seq = [0.9999, 0.5, 0.1];
    let i = 0;
    const res = rollEvent2Catch('good', () => seq[i++]);
    expect(eventFishById(res.fish.id)).toBe(res.fish);
    expect(res.fish.rarity).toBe('legendary');
    expect(res.form).toBe('variant');
    expect(res.score).toBe(800);
  });
});
