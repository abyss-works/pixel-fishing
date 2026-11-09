import { describe, expect, it } from 'vitest';
import { Downtime } from './downtime';

describe('Downtime', () => {
  it('끊기지 않았으면 0이다', () => {
    const d = new Downtime();
    expect(d.take(100)).toBe(0);
    expect(d.end(100)).toBe(0);
  });

  it('다시 연결되면 끊긴 뒤 지난 시간을 돌려준다', () => {
    const d = new Downtime();
    d.begin(100);
    expect(d.end(350)).toBe(250);
    expect(d.end(400)).toBe(0);
  });

  it('끊긴 채로 단계가 끝나면 지금까지의 시간을 한 번씩 나눠 돌려준다', () => {
    const d = new Downtime();
    d.begin(100);
    expect(d.take(300)).toBe(200);
    expect(d.take(500)).toBe(200);
    expect(d.end(600)).toBe(100);
  });
});
