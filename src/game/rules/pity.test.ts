// 천장 규칙 — 어종 일반 폼 최초 획득 천장(확률 질량)과 네임드 조우 천장(하루 단위 횟수).
import { describe, it, expect } from 'vitest';
import {
  SPECIES_PITY_K, PITY_DONE, NAMED_PITY_CATCHES,
  speciesPityCandidates, resolveSpeciesPity, accrueSpeciesPity, settleSpeciesPity,
  namedPityCeiling, newNamedPity, drawNamedEncounter, recordDuelFailure,
} from './pity';
import { drawRows, fishDrawShares, newState } from './logic';
import { applyAction } from './actions';
import type { ActionDeps } from './actions';
import type { BountyCtx } from './rules';
import { BOUNTIES } from '../content/bounties';

const DAY = '2026-12-31T23:40:00Z';   // 낮(분 40), 게임 날짜 2027-01-01
const NIGHT = '2026-12-31T23:55:00Z'; // 밤(분 55), 같은 게임 날짜
const NEXT_DAY = '2027-01-01T19:30:00Z'; // KST 04:30 → 게임 날짜 2027-01-02

describe('어종 천장 — 누적', () => {
  it('이번 캐치에서 각 어종 일반 폼이 나올 확률을 더한다', () => {
    const p = accrueSpeciesPity({}, 'pond', { phase: 'day' }, 0.75);
    const rows = drawRows('pond', { phase: 'day' });
    for (const r of rows) expect(p[r.fish.id]).toBeCloseTo(r.fishPct / 100 * 0.75, 12);
  });

  it('다이얼을 반영한 어종 확률의 합은 1이다', () => {
    const shares = fishDrawShares('pond', { phase: 'day', commonMult: 10 });
    expect(shares.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 12);
  });

  it('끝난 어종은 더하지 않고, 판정 다이얼이 확률에 반영된다', () => {
    const auto = accrueSpeciesPity({ goldcarp: PITY_DONE }, 'pond', { phase: 'day', commonMult: 10 }, 1);
    expect(auto.goldcarp).toBe(PITY_DONE);
    const manual = accrueSpeciesPity({}, 'pond', { phase: 'day' }, 1);
    expect(auto.carp).toBeLessThan(manual.carp);
  });

  it('밤 전용 어종은 낮 캐치에서 쌓이지 않는다', () => {
    const day = accrueSpeciesPity({}, 'sea', { phase: 'day' }, 1);
    const night = accrueSpeciesPity({}, 'sea', { phase: 'night' }, 1);
    expect(day.moonveil ?? 0).toBe(0);
    expect(night.moonveil).toBeGreaterThan(0);
  });
});

describe('어종 천장 — 확정', () => {
  it('지금 풀에 있고 누적이 K 이상인 미완료 어종만 후보다(누적 큰 순)', () => {
    const pity = { goldcarp: SPECIES_PITY_K + 1, goldfish: SPECIES_PITY_K, carp: SPECIES_PITY_K - 0.01, crucian: PITY_DONE };
    expect(speciesPityCandidates(pity, 'pond', 'day')).toEqual(['goldcarp', 'goldfish']);
    expect(speciesPityCandidates({ moonveil: 9 }, 'sea', 'day')).toEqual([]);
    expect(speciesPityCandidates({ moonveil: 9 }, 'sea', 'night')).toEqual(['moonveil']);
  });

  it('이미 일반 폼을 가진 후보는 끝 표시하고, 남은 첫 후보를 확정한다', () => {
    const pity = { goldcarp: 5, goldfish: 4 };
    const out = resolveSpeciesPity(pity, ['goldcarp', 'goldfish'], id => id === 'goldcarp');
    expect(out.target).toBe('goldfish');
    expect(out.pity.goldcarp).toBe(PITY_DONE);
    expect(out.pity.goldfish).toBe(4);
  });

  it('후보가 모두 이미 가진 어종이면 확정하지 않는다', () => {
    const out = resolveSpeciesPity({ carp: 5 }, ['carp'], () => true);
    expect(out.target).toBeNull();
    expect(out.pity.carp).toBe(PITY_DONE);
  });

  it('일반 폼을 잡으면 그 어종은 끝나고, 돌연변이는 진척을 바꾸지 않는다', () => {
    expect(settleSpeciesPity({ carp: 2 }, 'carp', 'normal').carp).toBe(PITY_DONE);
    expect(settleSpeciesPity({ carp: 2 }, 'carp', 'variant').carp).toBe(2);
  });
});

describe('네임드 조우 천장', () => {
  const named = BOUNTIES.find(q => q.difficulty === 'named' && q.zone === 'pacific')!;
  const never = () => 0.9999; // 조우 게이트 빗나감
  const spot = 'sea';

  it('천장은 결투 실패마다 절반으로 줄고, 두 번까지만 준다', () => {
    expect(namedPityCeiling(0)).toBe(NAMED_PITY_CATCHES);
    expect(namedPityCeiling(1)).toBe(Math.round(NAMED_PITY_CATCHES / 2));
    expect(namedPityCeiling(2)).toBe(Math.round(NAMED_PITY_CATCHES / 4));
    expect(namedPityCeiling(3)).toBe(Math.round(NAMED_PITY_CATCHES / 4));
  });

  it('후보가 있는 캐치의 빗나감을 세고, 천장 번째 캐치에서 조우를 확정한다', () => {
    let p = newNamedPity();
    for (let i = 0; i < NAMED_PITY_CATCHES - 1; i++) {
      const r = drawNamedEncounter(p, [named.id], spot, DAY, never);
      expect(r.quest).toBeNull();
      p = r.pity;
    }
    expect(p.misses).toBe(NAMED_PITY_CATCHES - 1);
    const hit = drawNamedEncounter(p, [named.id], spot, DAY, never);
    expect(hit.quest?.id).toBe(named.id);
    expect(hit.byCeiling).toBe(true);
    expect(hit.pity.misses).toBe(0);
  });

  it('수주한 네임드가 없으면 세지 않는다', () => {
    const r = drawNamedEncounter(newNamedPity(), [], spot, DAY, never);
    expect(r.quest).toBeNull();
    expect(r.pity.misses).toBe(0);
  });

  it('자연 조우도 빗나감 수를 0으로 되돌린다', () => {
    const r = drawNamedEncounter({ day: '2027-01-01', misses: 10, fails: 0 }, [named.id], spot, NIGHT, () => 0);
    expect(r.quest?.id).toBe(named.id);
    expect(r.byCeiling).toBe(false);
    expect(r.pity.misses).toBe(0);
  });

  it('결투 실패는 그날의 실패 수를 올리고, 게임 날짜가 바뀌면 모두 초기화된다', () => {
    const failed = recordDuelFailure(newNamedPity(), DAY);
    expect(failed).toEqual({ day: '2027-01-01', misses: 0, fails: 1 });
    const again = recordDuelFailure({ ...failed, misses: 7 }, NIGHT);
    expect(again).toEqual({ day: '2027-01-01', misses: 7, fails: 2 });
    const next = drawNamedEncounter(again, [named.id], spot, NEXT_DAY, never);
    expect(next.pity).toEqual({ day: '2027-01-02', misses: 1, fails: 0 });
  });

  it('실패 뒤에는 줄어든 천장에서 조우를 확정한다', () => {
    const ceiling = namedPityCeiling(1);
    const r = drawNamedEncounter({ day: '2027-01-01', misses: ceiling - 1, fails: 1 }, [named.id], spot, DAY, never);
    expect(r.quest?.id).toBe(named.id);
    expect(r.byCeiling).toBe(true);
  });
});

describe('리듀서 catch — 천장 적용', () => {
  const deps = (over: Partial<ActionDeps> = {}): ActionDeps => {
    let n = 0;
    return { rng: () => 0, today: '2027-01-01', now: DAY, newUid: () => `uid-${++n}`, ...over };
  };
  const catchPond = { type: 'catch', spot: 'pond', judgment: 'auto' } as const;

  it('천장에 닿은 미보유 어종을 일반 폼으로 확정하고, 그 어종의 천장을 끝낸다', () => {
    const out = applyAction({ ...newState(), pity: { goldcarp: SPECIES_PITY_K } }, catchPond, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.result).toMatchObject({ type: 'catch', fishId: 'goldcarp', info: { form: 'normal' } });
    expect(out.events[0].payload).toMatchObject({ fishId: 'goldcarp', pity: true });
    expect(out.state.pity.goldcarp).toBe(PITY_DONE);
    expect(out.state.pity.crucian).toBeGreaterThan(0);
  });

  it('이미 일반 폼을 가진 어종은 확정하지 않고 끝 표시만 한다', () => {
    const owned = { ...newState(), pity: { goldcarp: SPECIES_PITY_K },
      dex: { goldcarp: { normal: { count: 1, maxSize: null, first: null } } } };
    const out = applyAction(owned, catchPond, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.result).not.toMatchObject({ fishId: 'goldcarp' });
    expect(out.events[0].payload.pity).toBeUndefined();
    expect(out.state.pity.goldcarp).toBe(PITY_DONE);
  });

  it('네임드 천장에 닿으면 도전권을 발급하고 빗나감 수를 되돌린다', () => {
    const named = BOUNTIES.find(q => q.difficulty === 'named' && q.zone === 'pacific')!;
    const st = { ...newState(), boat: 2, location: { kind: 'base', id: 'harbor' } as const,
      namedPity: { day: '2027-01-01', misses: NAMED_PITY_CATCHES - 1, fails: 0 } };
    const out = applyAction(st, { type: 'catch', spot: 'sea', judgment: 'auto' }, deps({
      rng: () => 0.9999,
      bounty: { active: [named.id], complete: [], tickets: [], clearsToday: { general: 0, named: 0 } } satisfies BountyCtx,
    }));
    if (!out.ok) throw new Error(out.error);
    expect(out.events.find(e => e.type === 'ticket')?.payload).toEqual({ questId: named.id, pity: true });
    expect(out.state.namedPity.misses).toBe(0);
  });
});
