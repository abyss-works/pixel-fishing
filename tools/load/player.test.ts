import { describe, expect, it } from 'vitest';
import { MoveClock } from './clock';
import { Player } from './player';
import { StepStats } from './recorder';

describe('load Player', () => {
  it('초기 계정 컨텍스트로 가상 플레이어를 생성한다', () => {
    const stats = new StepStats();
    const player = new Player({
      origin: 'http://localhost:0',
      buildId: 'test',
      clientVersion: '0.0.0',
      idleRatio: 1,
      chatRate: 0,
      stats: () => stats,
      clock: new MoveClock(),
      fatal: () => {},
    }, 'sid=test');
    expect(player.online).toBe(false);
  });
});
