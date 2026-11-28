import { describe, expect, it } from 'vitest';
import { FX_RENDERERS, fxIntensityOf } from './fxPolicy';
import { FX_ONLY_RULES, TOAST_POLICY } from './toastPolicy';
import type { FxEventKind, SystemEventKind } from './toastPolicy';

const ALL_KINDS: FxEventKind[] = [
  ...(Object.keys(TOAST_POLICY) as SystemEventKind[]),
  ...(Object.keys(FX_ONLY_RULES) as FxEventKind[]),
];

describe('fxIntensityOf', () => {
  it('사건표의 포획 강도를 직접 행동 여부와 무관하게 돌려준다', () => {
    expect(fxIntensityOf('catch.legendaryOrFirstVariant', true)).toBe('spectacle');
    expect(fxIntensityOf('catch.legendaryOrFirstVariant', false)).toBe('spectacle');
    expect(fxIntensityOf('catch.epicOrRecord', true)).toBe('emphasis');
    expect(fxIntensityOf('catch.variant', false)).toBe('emphasis');
    expect(fxIntensityOf('catch.routine', true)).toBe('confirm');
    expect(fxIntensityOf('catch.routine', false)).toBe('confirm');
    expect(fxIntensityOf('live.peerCatch', false)).toBe('emphasis');
  });

  it('효과 규칙이 없는 사건은 none이다', () => {
    expect(fxIntensityOf('catch.rejected', true)).toBe('none');
    expect(fxIntensityOf('system.criticalError', false)).toBe('none');
  });

  it('모든 사건 종류가 네 강도 중 하나를 돌려준다', () => {
    for (const kind of ALL_KINDS) {
      for (const direct of [true, false]) {
        expect(['none', 'confirm', 'emphasis', 'spectacle']).toContain(fxIntensityOf(kind, direct));
      }
    }
  });
});

describe('FX_RENDERERS', () => {
  it('효과 규칙이 있는 사건 종류 집합과 렌더러 배정 키 집합이 같다', () => {
    const withRule = ALL_KINDS.filter(k => fxIntensityOf(k, true) !== 'none' || fxIntensityOf(k, false) !== 'none');
    expect(Object.keys(FX_RENDERERS).sort()).toEqual([...withRule].sort());
  });

  it('포획 넷은 카드, 필드, PiP이고 다른 플레이어 포획은 필드뿐이다', () => {
    expect(FX_RENDERERS['catch.routine']).toEqual(['catch-card', 'field', 'pip']);
    expect(FX_RENDERERS['live.peerCatch']).toEqual(['field']);
  });
});
