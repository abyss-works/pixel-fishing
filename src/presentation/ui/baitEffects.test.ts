import { describe, expect, it } from 'vitest';
import { BAITS } from '../../game/content/baits';
import { RARITY } from '../../game/content/rarity';
import { BAIT_WEIGHT_MULT } from '../../game/rules/balance';
import { baitBoostText, baitEffectLine } from './baitEffects';

describe('미끼 효과 문장', () => {
  it('배수는 밸런스 상수에서 읽는다 — 화면마다 같은 문장을 쓴다', () => {
    expect(baitBoostText('같은 등급')).toBe(`같은 등급 물고기가 걸리는 비중이 ${BAIT_WEIGHT_MULT}배가 돼요.`);
  });

  it('미끼마다 대상 등급 이름을 붙이고, 소개 문장에는 효과 수치를 적지 않는다', () => {
    for (const bait of BAITS) {
      expect(baitEffectLine(bait)).toBe(baitBoostText(`${RARITY[bait.targetRarity].name} 등급`));
      expect(bait.desc).not.toMatch(/배|×/);
    }
  });
});
