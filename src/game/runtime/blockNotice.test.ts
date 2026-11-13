import { describe, expect, it } from 'vitest';
import { BLOCK_RENEW_DISTANCE, BlockNotice } from './blockNotice';

describe('BlockNotice', () => {
  const D = BLOCK_RENEW_DISTANCE;

  it('처음 막힌 프레임에서만 알리고 막힌 채 이어지는 동안은 알리지 않는다', () => {
    const notice = new BlockNotice();
    expect([notice.step(true, { x: 0, y: 0 }), notice.step(true, { x: 0, y: 0 }), notice.step(true, { x: 0, y: 0 })])
      .toEqual([true, false, false]);
  });

  it('경계를 따라 미끄러지며 막힌 자리가 옮겨 가도 마지막으로 막힌 자리에서 가까우면 다시 알리지 않는다', () => {
    const notice = new BlockNotice();
    let announced = 0;
    for (let i = 0; i < 20; i++) {
      const x = i * (D - 4);
      if (notice.step(true, { x, y: 0 })) announced += 1;
      if (notice.step(false, { x: x + D - 2, y: 0 })) announced += 1;
    }
    expect(announced).toBe(1);
  });

  it('막히지 않은 채 마지막으로 막힌 자리에서 충분히 떨어졌다 다시 막히면 다시 알린다', () => {
    const notice = new BlockNotice();
    notice.step(true, { x: 0, y: 0 });
    notice.step(false, { x: D, y: 0 });
    expect(notice.step(true, { x: D, y: 0 })).toBe(true);
  });

  it('입력이 끊기면 같은 자리에서 다시 막혀도 알린다', () => {
    const notice = new BlockNotice();
    notice.step(true, { x: 0, y: 0 });
    notice.release();
    expect(notice.step(true, { x: 0, y: 0 })).toBe(true);
  });
});
