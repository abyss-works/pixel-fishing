import { describe, expect, it } from 'vitest';
import { catchCardLayers } from './catchCardFx';

const NONE = { cornerGlow: false, legendGlow: false, sweep: false, wisps: false, shimmer: false };

describe('catchCardLayers', () => {
  it('지시가 없거나 확인이면 어떤 등급과 폼이어도 등장 움직임만 남는다', () => {
    for (const intensity of [null, 'confirm'] as const) {
      expect(catchCardLayers('legendary', true, intensity)).toEqual(NONE);
      expect(catchCardLayers('epic', false, intensity)).toEqual(NONE);
    }
  });

  it('강조는 영웅 이상의 모서리 발광과 돌연변이 잔광, 이름 쉬머를 낸다', () => {
    expect(catchCardLayers('epic', false, 'emphasis')).toEqual({ ...NONE, cornerGlow: true });
    expect(catchCardLayers('common', true, 'emphasis')).toEqual({ ...NONE, wisps: true, shimmer: true });
    expect(catchCardLayers('rare', false, 'emphasis')).toEqual(NONE);
  });

  it('강조에서 전설의 빛줄기와 광채는 나오지 않는다', () => {
    expect(catchCardLayers('legendary', false, 'emphasis')).toEqual({ ...NONE, cornerGlow: true });
  });

  it('연출은 전설의 광채와 빛줄기까지 낸다', () => {
    expect(catchCardLayers('legendary', false, 'spectacle'))
      .toEqual({ ...NONE, cornerGlow: true, legendGlow: true, sweep: true });
    expect(catchCardLayers('legendary', true, 'spectacle'))
      .toEqual({ cornerGlow: true, legendGlow: true, sweep: true, wisps: true, shimmer: true });
  });

  it('연출이어도 등급이 전설이 아니면 광채와 빛줄기는 없다', () => {
    expect(catchCardLayers('common', true, 'spectacle')).toEqual({ ...NONE, wisps: true, shimmer: true });
    expect(catchCardLayers('epic', false, 'spectacle')).toEqual({ ...NONE, cornerGlow: true });
  });
});
