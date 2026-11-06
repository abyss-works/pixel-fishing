// 옷장 판정 — 서버 리듀서와 화면이 같은 함수를 부른다
import { describe, it, expect } from 'vitest';
import { canBuyHat, canChangeClothes, canWearHat, REJECT_TEXT } from './rules';
import { newState } from './logic';
import type { GameState } from './logic';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

describe('canChangeClothes', () => {
  it('팔레트 안의 번호면 통과한다 (경계 0과 11 포함)', () => {
    expect(canChangeClothes(0, 0)).toEqual({ ok: true });
    expect(canChangeClothes(11, 11)).toEqual({ ok: true });
  });

  it('범위 밖이거나 정수가 아니면 bad-request다', () => {
    for (const [s, p] of [[12, 0], [0, 12], [-1, 0], [0, -1], [1.5, 0], ['1', 0], [0, null], [undefined, 0]]) {
      expect(canChangeClothes(s, p), `${String(s)},${String(p)}`).toEqual({ ok: false, reason: 'bad-request' });
    }
  });
});

describe('canBuyHat', () => {
  it('골드가 가격과 같으면 살 수 있다', () => {
    expect(canBuyHat(seed({ gold: 50_000 }), 'cap-red')).toEqual({ ok: true });
  });

  it('골드가 가격보다 1 모자라면 not-enough-gold다', () => {
    expect(canBuyHat(seed({ gold: 49_999 }), 'cap-red')).toEqual({ ok: false, reason: 'not-enough-gold' });
  });

  it('이미 가진 모자는 hat-owned다 (골드가 충분해도)', () => {
    expect(canBuyHat(seed({ gold: 1e9, hats: ['cap-red'] }), 'cap-red')).toEqual({ ok: false, reason: 'hat-owned' });
  });

  it('없는 모자 id는 bad-request다', () => {
    expect(canBuyHat(seed({ gold: 1e9 }), 'cap-pink')).toEqual({ ok: false, reason: 'bad-request' });
    expect(canBuyHat(seed({ gold: 1e9 }), null)).toEqual({ ok: false, reason: 'bad-request' });
  });
});

describe('canWearHat', () => {
  it('가진 모자는 쓸 수 있고 없음(벗기)은 언제나 된다', () => {
    expect(canWearHat(seed({ hats: ['cap-blue'] }), 'cap-blue')).toEqual({ ok: true });
    expect(canWearHat(seed(), null)).toEqual({ ok: true });
  });

  it('갖지 않은 모자는 hat-not-owned, 없는 id는 bad-request다', () => {
    expect(canWearHat(seed(), 'cap-blue')).toEqual({ ok: false, reason: 'hat-not-owned' });
    expect(canWearHat(seed({ hats: ['cap-blue'] }), 'nope')).toEqual({ ok: false, reason: 'bad-request' });
    expect(canWearHat(seed(), 5)).toEqual({ ok: false, reason: 'bad-request' });
  });
});

describe('거절 문구', () => {
  it('새 사유에 유저 문구가 있다', () => {
    expect(REJECT_TEXT['hat-owned']).toBeTruthy();
    expect(REJECT_TEXT['hat-not-owned']).toBeTruthy();
  });
});
