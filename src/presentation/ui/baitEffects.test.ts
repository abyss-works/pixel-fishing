import { describe, expect, it } from 'vitest';
import { BAITS } from '../../game/content/baits';
import { RARITY } from '../../game/content/rarity';
import { BAIT_WEIGHT_BONUS } from '../../game/rules/balance';
import { baitBoostText, baitEffectLine } from './baitEffects';

describe('미끼 효과 문장', () => {
  it('보너스 값은 밸런스 상수에서 읽는다 - 화면마다 같은 문장을 쓴다', () => {
    const n = BAIT_WEIGHT_BONUS * 100;
    expect(baitBoostText('같은 등급')).toBe(`같은 등급 가중치가 ${n}% 늘어요.`);
    expect(baitBoostText('미끼에 적힌 등급의')).toBe(`미끼에 적힌 등급의 가중치가 ${n}% 늘어요.`);
  });

  it('라벨은 대상 등급 이름에 +N% 보너스를 붙이고, 그 N은 보너스 상수의 백분율과 같다', () => {
    for (const bait of BAITS) {
      const line = baitEffectLine(bait);
      expect(line).toBe(`${RARITY[bait.targetRarity].name} 등급 가중치 +${BAIT_WEIGHT_BONUS * 100}%`);
      expect(Number(/\+(\d+)%$/.exec(line)![1])).toBe(BAIT_WEIGHT_BONUS * 100);
      expect(bait.desc).not.toMatch(/배|×|%/);
    }
  });
});
