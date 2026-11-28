import { describe, expect, it } from 'vitest';
import { BOATS, MAX_BOAT } from '../content/boats';
import { newState } from './logic';
import { boatFameGateOf, canBuyBoat, canEnterZone } from './rules';

describe('boatFameGateOf', () => {
  it('다음 배 명성 조건에 미달하면 대상 배와 부족분을 반환하며 canBuyBoat 판정과 일치한다', () => {
    const next = BOATS[1]; // tier 2
    const state = { ...newState(), boat: 1, fame: next.fameReq - 30, gold: next.price };
    expect(canBuyBoat(state)).toEqual({ ok: false, reason: 'not-enough-fame' });
    expect(boatFameGateOf(1, next.fameReq - 30)).toEqual({ next, deficit: 30 });
  });

  it('명성을 채웠거나 마지막 배이거나 비정상 입력이면 null을 반환한다', () => {
    const next = BOATS[1];
    expect(boatFameGateOf(1, next.fameReq)).toBeNull();
    expect(boatFameGateOf(MAX_BOAT, 0)).toBeNull();
    expect(boatFameGateOf(1, Number.NaN)).toBeNull();
    expect(boatFameGateOf(-1, 0)).toBeNull();
  });
});

describe('canEnterZone', () => {
  it('마을은 배 0단계부터, 외해 구역은 entryBoat 이상부터 진입할 수 있다', () => {
    expect(canEnterZone(0, 'village')).toBe(true);
    expect(canEnterZone(0, 'pacific')).toBe(false);
    expect(canEnterZone(1, 'pacific')).toBe(true);
    expect(canEnterZone(Number.NaN, 'village')).toBe(false);
  });
});
