import { describe, expect, it } from 'vitest';
import { catchCardLayers } from './catchCardFx';

const NONE = { cornerGlow: false, legendGlow: false, sweep: false, wisps: false, shimmer: false };

describe('catchCardLayers', () => {
  it('지시가 없거나 확인이면 어떤 등급과 폼이어도 등장 움직임만 남는다', () => {
    for (const intensity of [null, 'small'] as const) {
      expect(catchCardLayers('legendary', true, intensity)).toEqual(NONE);
      expect(catchCardLayers('epic', false, intensity)).toEqual(NONE);
    }
  });

  it('크게는 영웅 이상의 모서리 발광과 돌연변이 잔광, 이름 쉬머를 낸다', () => {
    expect(catchCardLayers('epic', false, 'large')).toEqual({ ...NONE, cornerGlow: true });
    expect(catchCardLayers('common', true, 'large')).toEqual({ ...NONE, wisps: true, shimmer: true });
    expect(catchCardLayers('rare', false, 'large')).toEqual(NONE);
  });

  it('크게에서 전설의 빛줄기와 광채는 나오지 않는다', () => {
    expect(catchCardLayers('legendary', false, 'large')).toEqual({ ...NONE, cornerGlow: true });
  });

  it('가장 크게는 전설의 광채와 빛줄기까지 낸다', () => {
    expect(catchCardLayers('legendary', false, 'largest'))
      .toEqual({ ...NONE, cornerGlow: true, legendGlow: true, sweep: true });
    expect(catchCardLayers('legendary', true, 'largest'))
      .toEqual({ cornerGlow: true, legendGlow: true, sweep: true, wisps: true, shimmer: true });
  });

  it('가장 크게여도 등급이 전설이 아니면 광채와 빛줄기는 없다', () => {
    expect(catchCardLayers('common', true, 'largest')).toEqual({ ...NONE, wisps: true, shimmer: true });
    expect(catchCardLayers('epic', false, 'largest')).toEqual({ ...NONE, cornerGlow: true });
  });
});
