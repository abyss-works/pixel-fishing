import { describe, expect, it } from 'vitest';
import { newState } from './logic';
import { canEnterBase, fastTravelTargets, REJECT_TEXT } from './rules';

const at = (boat: number) => ({ ...newState(), boat });

describe('항구 게이트 (canEnterBase)', () => {
  it('항구가 있는 바다의 진입 배 단계를 본다 — 게이트가 없는 바다와 집은 자유다', () => {
    expect(canEnterBase(at(0), 'home')).toEqual({ ok: true });
    expect(canEnterBase(at(0), 'harbor')).toEqual({ ok: true });
    expect(canEnterBase(at(2), 'manila')).toEqual({ ok: false, reason: 'zone-locked' });
    expect(canEnterBase(at(3), 'manila')).toEqual({ ok: true });
    expect(canEnterBase(at(4), 'colombo')).toEqual({ ok: false, reason: 'zone-locked' });
    expect(canEnterBase(at(5), 'colombo')).toEqual({ ok: true });
    expect(canEnterBase(at(6), 'toamasina')).toEqual({ ok: false, reason: 'zone-locked' });
    expect(canEnterBase(at(7), 'toamasina')).toEqual({ ok: true });
    expect(canEnterBase(at(7), 'walvisbay')).toEqual({ ok: false, reason: 'zone-locked' });
    expect(canEnterBase(at(8), 'walvisbay')).toEqual({ ok: true });
  });

  it('거부 문구가 있다', () => {
    expect(REJECT_TEXT['zone-locked']).toMatch(/배/);
  });
});

describe('빠른 이동 목적지 (fastTravelTargets)', () => {
  it('지금 있는 항구를 뺀 나머지 항구를 바다와 함께 돌려준다', () => {
    expect(fastTravelTargets(at(9), 'manila').map(t => [t.port, t.zone, t.locked]))
      .toEqual([['harbor', 'pacific', null], ['colombo', 'indian', null], ['toamasina', 'madagascar', null],
        ['walvisbay', 'southatlantic', null]]);
  });

  it('배가 모자란 항구는 필요한 배를 사유로 잠근다', () => {
    const targets = fastTravelTargets(at(3), 'harbor');
    expect(targets.map(t => [t.port, t.locked])).toEqual([
      ['manila', null],
      ['colombo', '증기선(5단계) 필요'],
      ['toamasina', expect.stringMatching(/\(7단계\) 필요$/)],
      ['walvisbay', expect.stringMatching(/\(8단계\) 필요$/)],
    ]);
  });

  it('잠긴 목적지는 리듀서 게이트와 같은 판정이다', () => {
    for (let boat = 0; boat <= 9; boat++) {
      for (const t of fastTravelTargets(at(boat), 'home')) {
        expect(t.locked === null, `${boat} ${t.port}`).toBe(canEnterBase(at(boat), t.port).ok);
      }
    }
  });
});
