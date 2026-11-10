// 보너스 효과의 합산 — 같은 대상에 걸리는 효과는 먼저 더해 (1 ± 합)으로 한 번 적용하고, 기본 규칙 배수와 곱한다.
import { describe, it, expect } from 'vitest';
import { catchDrawOptions, commonWeightMultiplier, drawCatch, prepareCatchDraw } from './actions';
import { fishDrawShares, fishPool, mutationWeightsOf, newState } from './logic';
import type { DrawOptions, GameState } from './logic';
import { endedFirstCatch } from './firstCatch';
import { NO_GUILD_EFFECTS } from './guild';
import { relativeIdleBoost } from './power';
import { JUDGMENT_MULT } from './balance';
import { rarityWeightOf } from '../content/rarityWeights';
import { RARITY_ORDER } from '../content/rarity';
import type { RarityId } from '../content/rarity';
import type { PowerZone } from './stats';

const DAY = '2026-12-31T23:40:00Z';
const pz = (over: Partial<PowerZone> = {}): PowerZone =>
  ({ power: 10, req: 0, yellow: 10, red: 5, mult: 1, biteExtra: 0, ...over });
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const SPOT = 'pond' as const;

/** 등급별 확률 — 어종 확률을 등급으로 합친다 */
const gradeShare = (o: DrawOptions): Record<RarityId, number> => {
  const out = { common: 0, rare: 0, epic: 0, legendary: 0 } as Record<RarityId, number>;
  for (const { fish, share } of fishDrawShares(SPOT, o)) out[fish.rarity] += share;
  return out;
};
/** 손으로 푼 기대값 — 등급 가중치 × 일반 다이얼(공통 ÷ 판정) × (1 + 효과 합), 풀에 있는 등급만 정규화 */
const expected = (dial: number, effects: Partial<Record<RarityId, number>>): Record<RarityId, number> => {
  const present = new Set(fishPool(SPOT).map(f => f.rarity));
  const w = {} as Record<RarityId, number>;
  for (const r of RARITY_ORDER) {
    w[r] = present.has(r) ? rarityWeightOf(SPOT, r) * (r === 'common' ? dial : 1) * (1 + (effects[r] ?? 0)) : 0;
  }
  const total = RARITY_ORDER.reduce((s, r) => s + w[r], 0);
  return Object.fromEntries(RARITY_ORDER.map(r => [r, w[r] / total])) as Record<RarityId, number>;
};
const close = (a: Record<RarityId, number>, b: Record<RarityId, number>) => {
  for (const r of RARITY_ORDER) expect(a[r], r).toBeCloseTo(b[r], 12);
};

/** 실제 캐치 경로 — 미끼는 prepareCatchDraw, 길드는 drawCatch가 얹는다. drawCatch가 쌓은 천장 값을 돌려준다 */
const catchPath = (judgment: 'perfect' | 'auto' | 'normal', baitId: string | null, guildRare: number, pzMult = 1) => {
  const s = seed(baitId ? { items: { [baitId]: 1 }, activeBait: baitId } : {});
  const prep = prepareCatchDraw(s, judgment, DAY, pz({ mult: pzMult }));
  const d = drawCatch(
    { ...s, firstCatch: endedFirstCatch() }, SPOT, prep.judgment, 100, pzMult, () => 0.5, prep.phaseOpts, () => false,
    { ...NO_GUILD_EFFECTS, rare: guildRare },
  );
  return { prep, pity: d.pity as Record<string, number>, caught: d.fish.id };
};

/** 천장 누적은 실제 추첨과 같은 다이얼의 어종 확률 × 일반 폼 비율이다 — 잡힌 어종은 정산으로 바뀌므로 뺀다 */
function expectPityShares(pity: Record<string, number>, caught: string, o: DrawOptions): void {
  const forms = mutationWeightsOf(newState(), SPOT);
  const normalShare = forms.normal / (forms.normal + forms.variant);
  const rest = fishDrawShares(SPOT, o).filter(s => s.fish.id !== caught);
  expect(rest.length).toBeGreaterThan(0);
  for (const { fish, share } of rest) expect(pity[fish.id], fish.id).toBeCloseTo(share * normalShare, 12);
}

describe('등급 가중치 — 효과를 등급별로 모아 (1 + 합)을 한 번 적용한다', () => {
  const GUILD = 0.08;
  const manualDial = 1 / JUDGMENT_MULT.perfect;
  it('(a) 효과가 없으면 다이얼만 적용된다', () => {
    close(gradeShare({ rareMult: 2 }), expected(manualDial, {}));
    close(gradeShare({}), expected(1, {}));
  });
  it('(b) 미끼만 — 대상 등급 가중치 +100%', () => {
    for (const r of RARITY_ORDER) {
      close(gradeShare({ rareMult: 2, weightEffects: { [r]: 1 } }), expected(manualDial, { [r]: 1 }));
    }
  });
  it('(b) 미끼 판정 경로는 대상 등급에 +1.00을 걸고, 방치에는 걸지 않는다', () => {
    expect(catchPath('perfect', 'bait-rare', 0).prep.phaseOpts.weightEffects).toEqual({ rare: 1 });
    expect(catchPath('auto', 'bait-rare', 0).prep.phaseOpts.weightEffects).toBeUndefined();
  });
  it('(c) 길드만 — 수동 PERFECT와 최대 방치 배수에서 일반 가중치에 (1 − 합)', () => {
    close(gradeShare({ rareMult: 2, weightEffects: { common: -GUILD } }), expected(manualDial, { common: -GUILD }));
    const idle = relativeIdleBoost(10_000, SPOT);
    close(gradeShare({ commonMult: idle, weightEffects: { common: -GUILD } }), expected(idle, { common: -GUILD }));
    const { pity, caught } = catchPath('perfect', null, GUILD);
    expectPityShares(pity, caught, { ...catchDrawOptions('perfect', 100, SPOT, 1, { phase: 'day' }), weightEffects: { common: -GUILD } });
  });
  it('(d) 희귀 미끼 + 길드 — 대상이 달라 각자 적용한다(기존과 같다)', () => {
    close(
      gradeShare({ rareMult: 2, weightEffects: { rare: 1, common: -GUILD } }),
      expected(manualDial, { rare: 1, common: -GUILD }),
    );
    const { pity, caught } = catchPath('perfect', 'bait-rare', GUILD);
    expectPityShares(pity, caught, {
      ...catchDrawOptions('perfect', 100, SPOT, 1, { phase: 'day' }), weightEffects: { rare: 1, common: -GUILD },
    });
  });
  it('(e) 일반 미끼 + 길드 — 같은 대상이라 (1 + 1.00 − 합)이다', () => {
    close(gradeShare({ rareMult: 2, weightEffects: { common: 1 - GUILD } }), expected(manualDial, { common: 1 - GUILD }));
    const { pity, caught } = catchPath('perfect', 'bait-common', GUILD);
    expectPityShares(pity, caught, {
      ...catchDrawOptions('perfect', 100, SPOT, 1, { phase: 'day' }), weightEffects: { common: 1 - GUILD },
    });
  });
  it('(f) 파워 미달 페널티는 효과의 합과 곱한다', () => {
    const penalty = 8;
    const o = catchDrawOptions('good', 0, SPOT, penalty, { phase: 'day' });
    close(
      gradeShare({ ...o, weightEffects: { common: 1 - GUILD } }),
      expected(penalty / JUDGMENT_MULT.good, { common: 1 - GUILD }),
    );
    const { pity, caught } = catchPath('normal', 'bait-common', GUILD, penalty);
    expectPityShares(pity, caught, {
      ...catchDrawOptions('normal', 100, SPOT, penalty, { phase: 'day' }), weightEffects: { common: 1 - GUILD },
    });
  });
});

describe('기본 규칙 배수 — 방치 배수와 파워 미달 페널티를 나눠 돌려준다', () => {
  it('방치는 방치 배수 × 페널티, 판정 배수는 1', () => {
    const m = commonWeightMultiplier('auto', 10_000, SPOT, 4);
    expect(m.idle).toBe(relativeIdleBoost(10_000, SPOT));
    expect(m).toMatchObject({ judgment: 1, penalty: 4 });
    expect(m.total).toBe(m.idle * 4);
    expect(m.total).toBe(catchDrawOptions('auto', 10_000, SPOT, 4, { phase: 'day' }).commonMult);
  });
  it('수동은 방치 배수 1, 일반 가중치는 페널티 ÷ 판정 배수', () => {
    const m = commonWeightMultiplier('perfect', 10_000, SPOT, 2);
    expect(m).toEqual({ judgment: JUDGMENT_MULT.perfect, idle: 1, penalty: 2, total: 2 / JUDGMENT_MULT.perfect });
    const o = catchDrawOptions('perfect', 10_000, SPOT, 2, { phase: 'day' });
    expect(m.total).toBe((o.commonMult ?? 1) / (o.rareMult ?? 1));
  });
});
