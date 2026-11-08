import { describe, expect, it } from 'vitest';
import { artifactById } from '../../game/content/artifacts';
import { artifactEffectLine, artifactEffectLines, artifactSystemLines } from './artifactEffects';

const art = (id: string) => artifactById(id)!;

describe('유물 효과 문장', () => {
  it('레벨을 넘기면 그 레벨의 수치로 쓴다', () => {
    expect(artifactEffectLine(art('wreck-compass'), 'sail', 1)).toBe('항해 속도 +10%');
    expect(artifactEffectLine(art('wreck-compass'), 'sail', 5)).toBe('항해 속도 +20%');
    expect(artifactEffectLines(art('abyss-angler'), 5)).toEqual(['네임드 결투 가속 −20%']);
    expect(artifactEffectLines(art('varuna-scale'), 5)).toEqual(['미끼값 −50%']);
  });

  it('전설 유물은 효과 줄이 없고 보너스와 페널티 줄이 따로 나온다', () => {
    const mirror = art('mami-wata-mirror');
    expect(artifactEffectLines(mirror, 1)).toEqual([]);
    expect(artifactSystemLines(mirror)).toEqual({ bonus: '네임드 토벌 하루 +1번', penalty: '네임드 토벌 골드 −30%' });
    expect(artifactSystemLines(art('wreck-compass'))).toEqual({ bonus: null, penalty: null });
  });
});
