import { describe, expect, it } from 'vitest';
import { MoveClock } from './clock';

describe('MoveClock', () => {
  const p = { x: 1.5, y: 2.5, line: true, bob: { x: 3, y: 4 } };

  it('보낸 시각과 받은 시각의 차를 돌려준다', () => {
    const c = new MoveClock();
    c.mark('a', p, 100);
    expect(c.delay('a', p, 130)).toBe(30);
  });

  it('기록이 없거나 보낸 사람이 다르면 null이다', () => {
    const c = new MoveClock();
    c.mark('a', p, 100);
    expect(c.delay('b', p, 130)).toBeNull();
    expect(c.delay('a', { ...p, x: 9 }, 130)).toBeNull();
    expect(c.delay('a', { ...p, line: false }, 130)).toBeNull();
  });

  it('오래된 기록만 지운다', () => {
    const c = new MoveClock();
    c.mark('a', p, 0);
    c.mark('b', p, 90);
    c.prune(100, 50);
    expect(c.delay('a', p, 100)).toBeNull();
    expect(c.delay('b', p, 100)).toBe(10);
  });
});
