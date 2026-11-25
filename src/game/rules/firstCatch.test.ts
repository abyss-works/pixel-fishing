// 마을 해역별 첫 경험 보장 — 상한 테이블(pond 20, river 30) 안에서 해당 해역 전종 일반 폼 1회 이상 획득을 보장한다.
import { describe, it, expect } from 'vitest';
import {
  FIRST_CATCH_SPOT_CAPS, FIRST_CATCH_SPOTS,
  endedFirstCatch, endedFirstCatchSpot, firstCatchTarget, hasPendingFirstCatch,
  isFirstCatchSpot, newFirstCatch, newFirstCatchSpot, settleFirstCatch,
} from './firstCatch';
import type { FirstCatch, FirstCatchSpot, FirstCatchSpotId } from './firstCatch';
import { drawCatch } from './actions';
import { fishPool } from './logic';
import { NO_GUILD_EFFECTS } from './guild';
import { NO_COOK_EFFECTS } from './cooking';
import { NO_ACHIEVEMENT_BONUSES } from './effects';
import { PITY_DONE, SPECIES_PITY_K } from './pity';
import { FISH } from '../content/fish';
import type { SpotId } from '../content/spots';

const rngOf = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
const mkPrng = (seed = 1) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};
const spotAt = (spot: FirstCatchSpotId, n: number, over: Partial<FirstCatchSpot> = {}): FirstCatch => ({
  ...newFirstCatch(),
  [spot]: { n, active: true, ...over },
});

describe('상수 및 헬퍼', () => {
  it('보장 대상 해역 상한 테이블은 마을 연못 20회, 마을 강 30회다', () => {
    expect(FIRST_CATCH_SPOT_CAPS).toEqual({ pond: 20, river: 30 });
    expect(FIRST_CATCH_SPOTS).toEqual(['pond', 'river']);
    expect(isFirstCatchSpot('pond')).toBe(true);
    expect(isFirstCatchSpot('river')).toBe(true);
    expect(isFirstCatchSpot('sea')).toBe(false);
  });

  it('hasPendingFirstCatch와 초기/종료 생성자가 해역별 상태를 반영한다', () => {
    expect(newFirstCatchSpot()).toEqual({ n: 0, active: true });
    expect(endedFirstCatchSpot()).toEqual({ n: 0, active: false });
    expect(hasPendingFirstCatch(newFirstCatch())).toBe(true);
    expect(hasPendingFirstCatch(endedFirstCatch())).toBe(false);
    expect(hasPendingFirstCatch({ pond: endedFirstCatch().pond, river: newFirstCatch().river })).toBe(true);
  });
});

describe('firstCatchTarget', () => {
  it('여유 구간(rem > missing)에서는 진척이 뒤처진 체크포인트에서만 미보유 어종을 고른다', () => {
    // pond: 6종 / 상한 20 -> 첫 체크포인트는 4번째(n=3)
    expect(firstCatchTarget(spotAt('pond', 0), 'pond', 'day', () => false, rngOf(0))).toBeNull();
    expect(firstCatchTarget(spotAt('pond', 2), 'pond', 'day', () => false, rngOf(0))).toBeNull();
    // 아직 0종이면 4번째(n=3)에서 미보유 어종을 보장
    expect(firstCatchTarget(spotAt('pond', 3), 'pond', 'day', () => false, rngOf(0))?.spot).toBe('pond');
    // 이미 1종 이상 보유했으면 4번째에는 개입하지 않는다
    expect(firstCatchTarget(spotAt('pond', 3), 'pond', 'day', id => id === 'crucian', rngOf(0))).toBeNull();
  });

  it('남은 보장 횟수(cap - n)가 미보유 어종 수 이하일 때는 반드시 미보유 어종 중 하나를 선택한다', () => {
    const pondPool = fishPool('pond', 'day');
    const missingTwo = new Set(['goldfish', 'goldcarp']);
    const owns = (id: string) => !missingTwo.has(id);
    // n=18 -> rem = 20 - 18 = 2 === missing(2)
    const picked = firstCatchTarget(spotAt('pond', 18), 'pond', 'day', owns, rngOf(0));
    expect(picked).not.toBeNull();
    expect(missingTwo.has(picked!.id)).toBe(true);

    // river: cap=30, n=28 -> rem = 2 === missing(2)
    const riverMissing = new Set(['rainbow', 'riverlord']);
    const pickedRiver = firstCatchTarget(spotAt('river', 28), 'river', 'day', id => !riverMissing.has(id), rngOf(0.99));
    expect(pickedRiver?.id).toBe('riverlord');
    expect(pondPool.length).toBe(6);
  });

  it('이미 모든 어종 일반 폼을 보유했거나 상한에 도달했거나 비활성/비대상 해역이면 null을 돌려준다', () => {
    expect(firstCatchTarget(spotAt('pond', 19), 'pond', 'day', () => true, rngOf(0))).toBeNull();
    expect(firstCatchTarget(spotAt('pond', 20), 'pond', 'day', () => false, rngOf(0))).toBeNull();
    expect(firstCatchTarget(endedFirstCatch(), 'pond', 'day', () => false, rngOf(0))).toBeNull();
    expect(firstCatchTarget(endedFirstCatch(), 'river', 'day', () => false, rngOf(0))).toBeNull();
    expect(firstCatchTarget(spotAt('pond', 19), 'sea', 'day', () => false, rngOf(0))).toBeNull();
    expect(firstCatchTarget(spotAt('pond', 19), 'barrierreef', 'day', () => false, rngOf(0))).toBeNull();
  });
});

describe('settleFirstCatch', () => {
  it('대상 해역 카운트만 올리고 다른 마을 해역은 건드리지 않는다', () => {
    const p = settleFirstCatch(newFirstCatch(), 'pond', () => false);
    expect(p.pond).toEqual({ n: 1, active: true });
    expect(p.river).toEqual(newFirstCatch().river);

    const r = settleFirstCatch(newFirstCatch(), 'river', () => false);
    expect(r.river).toEqual({ n: 1, active: true });
    expect(r.pond).toEqual(newFirstCatch().pond);
  });

  it('상한에 도달하거나 모든 어종 일반 폼을 보유하면 그 해역의 보장을 종료한다', () => {
    const atCap = settleFirstCatch(spotAt('pond', 19), 'pond', () => false);
    expect(atCap.pond).toEqual(endedFirstCatchSpot());
    expect(atCap.river).toEqual(newFirstCatch().river);

    const allOwned = settleFirstCatch(spotAt('river', 5), 'river', () => true);
    expect(allOwned.river).toEqual(endedFirstCatchSpot());
    expect(allOwned.pond).toEqual(newFirstCatch().pond);
  });

  it('끝난 해역이나 바다 해역은 상태를 변경하지 않는다', () => {
    const ended = endedFirstCatch();
    expect(settleFirstCatch(ended, 'pond', () => false)).toBe(ended);
    const init = newFirstCatch();
    expect(settleFirstCatch(init, 'sea', () => false)).toBe(init);
    expect(settleFirstCatch(init, 'barrierreef', () => false)).toBe(init);
  });
});

describe('drawCatch 보장', () => {
  const base = { pity: {}, artifacts: [] as string[] };
  const phaseOpts = { phase: 'day' as const };

  const simulateSpot = (spot: SpotId, count: number, rng: () => number) => {
    let fc = newFirstCatch();
    let pity: Record<string, number> = {};
    const normalOwned = new Set<string>();
    const forms: string[] = [];
    for (let i = 0; i < count; i++) {
      const d = drawCatch(
        { ...base, pity, firstCatch: fc },
        spot, 'normal', 10, 1, rng, phaseOpts,
        id => normalOwned.has(id),
      );
      fc = d.firstCatch;
      pity = d.pity;
      forms.push(d.extras.form);
      if (d.extras.form === 'normal') normalOwned.add(d.fish.id);
    }
    return { fc, pity, normalOwned, forms };
  };

  it('마을 연못은 상한 20회 안에 6종 일반 폼을 100% 완성하고 보장을 종료한다 (최악 rng=0 및 난수 시퀀스)', () => {
    const pondIds = FISH.filter(f => f.spot === 'pond').map(f => f.id);
    expect(pondIds).toHaveLength(6);

    for (const rng of [rngOf(0), rngOf(0.999999), mkPrng(42), mkPrng(999)]) {
      const res = simulateSpot('pond', 20, rng);
      for (const id of pondIds) expect(res.normalOwned.has(id), id).toBe(true);
      expect(res.fc.pond).toEqual(endedFirstCatchSpot());
      expect(res.fc.river).toEqual(newFirstCatchSpot());
    }
  });

  it('마을 강은 상한 30회 안에 6종 일반 폼을 100% 완성하고 보장을 종료한다 (최악 rng=0 및 난수 시퀀스)', () => {
    const riverIds = FISH.filter(f => f.spot === 'river').map(f => f.id);
    expect(riverIds).toHaveLength(6);

    for (const rng of [rngOf(0), rngOf(0.999999), mkPrng(7), mkPrng(2026)]) {
      const res = simulateSpot('river', 30, rng);
      for (const id of riverIds) expect(res.normalOwned.has(id), id).toBe(true);
      expect(res.fc.river).toEqual(endedFirstCatchSpot());
      expect(res.fc.pond).toEqual(newFirstCatchSpot());
    }
  });

  it('보장 캐치(guaranteed !== null)는 rng=0이어도 반드시 일반 폼(normal)으로 고정된다', () => {
    // n=3, 보유 0종 -> 4번째 캐치에서 guaranteed 발동. rng=0은 통상 변이를 뽑지만 일반으로 고정되어야 한다
    const d = drawCatch(
      { ...base, firstCatch: spotAt('pond', 3) },
      'pond', 'auto', 10, 1, rngOf(0), phaseOpts, () => false,
    );
    expect(d.extras.form).toBe('normal');
    expect(d.byCeiling).toBe(false);
    expect(d.firstCatch.pond).toEqual({ n: 4, active: true });
    // 보장 캐치로 잡은 어종은 어종 천장도 PITY_DONE으로 정산된다
    expect(d.pity[d.fish.id]).toBe(PITY_DONE);
  });

  it('SPECIES_PITY_K 어종 천장은 충돌이 없을 때 그대로 일반 폼으로 확정된다', () => {
    const d = drawCatch(
      { ...base, pity: { goldcarp: SPECIES_PITY_K }, firstCatch: newFirstCatch() },
      'pond', 'auto', 10, 1, rngOf(0), phaseOpts, () => false,
      NO_GUILD_EFFECTS, NO_COOK_EFFECTS, NO_ACHIEVEMENT_BONUSES,
    );
    expect(d.fish.id).toBe('goldcarp');
    expect(d.extras.form).toBe('normal');
    expect(d.byCeiling).toBe(true);
    expect(d.pity.goldcarp).toBe(PITY_DONE);
  });

  it('바다 해역 캐치는 첫 경험 보장 상태를 건드리지 않는다', () => {
    const init = newFirstCatch();
    const d = drawCatch({ ...base, firstCatch: init }, 'sea', 'auto', 10, 1, rngOf(0.1), phaseOpts, () => false);
    expect(d.firstCatch).toEqual(init);
  });
});
