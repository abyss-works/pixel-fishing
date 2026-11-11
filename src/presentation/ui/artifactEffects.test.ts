import { describe, expect, it } from 'vitest';
import { artifactById } from '../../game/content/artifacts';
import {
  artifactEffectKeys, artifactEffectLabel, artifactEffectLine, artifactEffectLines, artifactEffectValue, artifactSystemLines,
} from './artifactEffects';

const art = (id: string) => artifactById(id)!;
// 미끼값 효과를 가진 유물은 지금 콘텐츠에 없으므로 효과 문장 계약은 합성 유물로 검증한다
const discountArt = { ...art('wreck-compass'), effects: { baitDiscount: 0.25 } };

describe('유물 효과 문장', () => {
  it('레벨을 넘기면 그 레벨의 수치로 쓴다', () => {
    expect(artifactEffectLine(art('wreck-compass'), 'sail', 1)).toBe('항해 속도 +10%');
    expect(artifactEffectLine(art('wreck-compass'), 'sail', 5)).toBe('항해 속도 +20%');
    expect(artifactEffectLines(art('abyss-angler'), 5)).toEqual(['네임드 결투 가속 −20%']);
    expect(artifactEffectLines(art('varuna-scale'), 5)).toEqual(['요리할 때 20% 확률로 하나 더 완성']);
    expect(artifactEffectLines(discountArt, 5)).toEqual(['미끼값 −50%']);
  });

  it('전설 유물은 효과 줄이 없고 보너스와 페널티 줄이 따로 나온다', () => {
    const mirror = art('mami-wata-mirror');
    expect(artifactEffectLines(mirror, 1)).toEqual([]);
    expect(artifactSystemLines(mirror)).toEqual({ bonus: '네임드 토벌 하루 +1번', penalty: '네임드 토벌 골드 −30%' });
    expect(artifactSystemLines(art('wreck-compass'))).toEqual({ bonus: null, penalty: null });
  });

  it('효과 값은 소수 둘째 자리까지 보이고 끝의 0은 뺀다', () => {
    expect(artifactEffectLine(art('wreck-compass'), 'sail', 2)).toBe('항해 속도 +12.5%');
    expect(artifactEffectLine(discountArt, 'baitDiscount', 2)).toBe('미끼값 −31.25%');
    expect(artifactEffectValue(discountArt, 'baitDiscount', 5)).toBe('−50%');
    expect(artifactEffectLine(art('varuna-scale'), 'extraCookChance', 2)).toBe('요리할 때 12.5% 확률로 하나 더 완성');
    expect(artifactEffectValue(art('varuna-scale'), 'extraCookChance', 1)).toBe('10%');
  });

  it('코모로의 골판은 돌연변이 가중치 증가율로 쓰고 확률로 환산하지 않는다', () => {
    expect(artifactEffectLine(art('elder-scale'), 'mutationWeight', 1)).toBe('돌연변이 가중치 +25%');
    expect(artifactEffectValue(art('elder-scale'), 'mutationWeight', 2)).toBe('+31.25%');
    expect(artifactEffectValue(art('elder-scale'), 'mutationWeight', 5)).toBe('+50%');
  });

  it('효과가 없으면 값도 문장도 없다', () => {
    expect(artifactEffectValue(art('wreck-compass'), 'baitDiscount', 1)).toBeNull();
    expect(artifactEffectKeys(art('wreck-compass'))).toEqual(['sail']);
    expect(artifactEffectKeys(art('mami-wata-mirror'))).toEqual([]);
    expect(artifactEffectValue(art('wreck-compass'), 'extraCookChance', 1)).toBeNull();
    expect(artifactEffectKeys(art('varuna-scale'))).toEqual(['extraCookChance']);
  });

  it('효과 이름은 문장의 앞부분과 같다', () => {
    expect(artifactEffectLabel('duelSpeedupCut')).toBe('네임드 결투 가속');
    expect(artifactEffectLine(art('abyss-angler'), 'duelSpeedupCut', 1)).toBe(`${artifactEffectLabel('duelSpeedupCut')} −10%`);
  });
});
