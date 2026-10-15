import { describe, it, expect } from 'vitest';
import { DEFAULT_FISH_ART_STYLE, FISH_ART_STYLES, fishArt, isFishArtStyle } from './index';
import { drawFishSprite } from './v1Shapes';
import { FISH } from '../../../content/fish';
import { SILHOUETTE } from '../../../content/sprites';
import type { Ctx } from '../common';

/** fillRect 호출을 (색, 좌표, 크기)로 기록하는 컨텍스트 — jsdom에는 캔버스가 없다 */
function recorder() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) { calls.push(`${this.fillStyle}@${x},${y},${w},${h}`); },
  };
  return { ctx: ctx as unknown as Ctx, calls };
}

const carp = FISH.find(f => f.id === 'carp')!;

describe('물고기 그래픽 포트', () => {
  it('스타일은 v1·v2 두 가지이고 기본은 v1이다', () => {
    expect(FISH_ART_STYLES).toEqual(['v1', 'v2']);
    expect(DEFAULT_FISH_ART_STYLE).toBe('v1');
    expect(isFishArtStyle('v2')).toBe(true);
    expect(isFishArtStyle('v3')).toBe(false);
    expect(isFishArtStyle(null)).toBe(false);
  });

  it('각 어댑터는 자기 스타일을 밝히고, 움직임 연출은 v2만 지원한다', () => {
    expect(fishArt('v1')).toMatchObject({ style: 'v1', motion: false });
    expect(fishArt('v2')).toMatchObject({ style: 'v2', motion: true });
  });
});

describe('v1 어댑터 — 스프라이트화 직전 렌더러 스냅샷', () => {
  it('일반 폼은 어종 기준색으로 절차 렌더러와 똑같이 그린다', () => {
    const a = recorder(), b = recorder();
    fishArt('v1').drawCentered(a.ctx, carp, 40, 20, { scale: 3 });
    drawFishSprite(b.ctx, 40, 20, carp.shape, carp.color, 3, true);
    expect(a.calls).toEqual(b.calls);
    expect(a.calls[0]).toMatch(new RegExp(`^${carp.color}@`));
  });

  it('변이 폼은 변이 색으로 그린다', () => {
    const a = recorder(), b = recorder();
    fishArt('v1').drawCentered(a.ctx, carp, 40, 20, { scale: 3, form: 'variant' });
    drawFishSprite(b.ctx, 40, 20, carp.shape, carp.variant.color, 3, true);
    expect(a.calls).toEqual(b.calls);
  });

  it('미발견은 실루엣 색을 기준색으로 몸만 그린다 — 눈·하이라이트 없음', () => {
    const a = recorder(), b = recorder();
    fishArt('v1').drawCentered(a.ctx, carp, 40, 20, { scale: 3, discovered: false });
    drawFishSprite(b.ctx, 40, 20, carp.shape, SILHOUETTE, 3, false);
    expect(a.calls).toEqual(b.calls);
    expect(a.calls.some(c => c.startsWith('#000@') || c.startsWith('rgba('))).toBe(false);
  });

  it('반전·시각을 넘겨도 무시한다 — 움직임이 없는 스냅샷이다', () => {
    const a = recorder(), b = recorder();
    fishArt('v1').drawCentered(a.ctx, carp, 40, 20, { scale: 3, flip: true, t: 1.3 });
    fishArt('v1').drawCentered(b.ctx, carp, 40, 20, { scale: 3 });
    expect(a.calls).toEqual(b.calls);
  });

  it('모든 어종의 형태를 그릴 수 있다', () => {
    for (const f of FISH) {
      const a = recorder();
      fishArt('v1').drawCentered(a.ctx, f, 16, 8, { scale: 1 });
      expect(a.calls.length, f.id).toBeGreaterThan(0);
    }
  });
});
