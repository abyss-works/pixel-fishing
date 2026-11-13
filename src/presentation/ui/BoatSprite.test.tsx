import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BOATS } from '../../game/content/boats';
import { BOAT_SPRITES } from '../../game/content/sprites/boatSprites.generated';
import BoatSprite from './BoatSprite';

afterEach(cleanup);

describe('배 스프라이트', () => {
  it('그림이 있는 단계는 캔버스를 그린다', () => {
    const { container } = render(<BoatSprite tier={1} preset="row" ariaLabel="조각배" />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('그림이 없는 단계는 같은 크기의 빈 자리만 두고 깨지지 않는다', () => {
    const tier = BOATS.map(b => b.tier).find(t => !BOAT_SPRITES[t]);
    if (tier === undefined) return; // 모든 단계에 그림이 있으면 빈 자리 경로가 없다
    const drawn = render(<BoatSprite tier={1} preset="row" />).container.querySelector('canvas')!;
    cleanup();
    const { container } = render(<BoatSprite tier={tier} preset="row" />);
    expect(container.querySelector('canvas')).toBeNull();
    const slot = container.firstElementChild as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.style.width).toBe(`${drawn.width}px`);
    expect(slot.style.height).toBe(`${drawn.height}px`);
  });
});
