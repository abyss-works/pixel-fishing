import { describe, expect, it } from 'vitest';
import { CHALLENGE_YELLOW } from '../../../game/rules/balance';
import { NAMED } from '../../../game/content/named';

const MAX_HP = Math.max(...NAMED.map(n => n.hp));
import { DUEL_IDLE_SWEEPS, duelCursor, duelHit, duelSweepMs, duelZoneCenter } from './duel';

describe('결투 커서', () => {
  it('끝에서 돌아오며 왕복한다 — 처음으로 순간이동하지 않는다', () => {
    expect(duelCursor(0)).toBe(0);
    expect(duelCursor(0.5)).toBe(0.5);
    expect(duelCursor(1)).toBe(1);
    expect(duelCursor(1.25)).toBe(0.75);
    expect(duelCursor(2)).toBe(0);
    expect(duelCursor(2.5)).toBe(0.5);
  });
});

describe('결투 존', () => {
  it('첫 존은 가운데이고, 맞힐 때마다 다른 자리로 옮긴다', () => {
    expect(duelZoneCenter(0)).toBe(0.5);
    for (let h = 1; h < MAX_HP; h++) {
      expect(duelZoneCenter(h)).not.toBe(duelZoneCenter(h - 1));
    }
  });

  it('존은 언제나 바 안에 다 들어간다', () => {
    for (let h = 0; h < MAX_HP + 3; h++) {
      const c = duelZoneCenter(h);
      expect(c - CHALLENGE_YELLOW / 2).toBeGreaterThanOrEqual(0);
      expect(c + CHALLENGE_YELLOW / 2).toBeLessThanOrEqual(1);
    }
  });

  it('존 안이면 명중, 밖이면 빗나감이다 — 판정 폭은 기존 노란 존과 같다', () => {
    expect(duelHit(0.25, 0.25)).toBe(true);
    expect(duelHit(0.25 + CHALLENGE_YELLOW / 2 - 0.001, 0.25)).toBe(true);
    expect(duelHit(0.25 + CHALLENGE_YELLOW / 2 + 0.01, 0.25)).toBe(false);
  });
});

describe('결투 속도', () => {
  it('낚싯대 바 속도로 시작해 맞힐 때마다 15%p씩 빨라지고, 40%에서 멈춘다 — 마지막 3번은 최고 속도다', () => {
    expect(duelSweepMs(1000, 0)).toBe(1000);
    expect(duelSweepMs(1000, 1)).toBe(850);
    expect(duelSweepMs(1000, 3)).toBe(550);
    expect(duelSweepMs(1000, 4)).toBe(400);
    expect(duelSweepMs(1000, 6)).toBe(400);
    expect(duelSweepMs(1000, 3)).toBeLessThan(duelSweepMs(1000, 2));
    expect(duelSweepMs(1000, 100)).toBe(400);
  });

  it('한 번 왕복하도록 치지 않으면 도주로 센다', () => {
    expect(DUEL_IDLE_SWEEPS).toBe(2);
  });
});
