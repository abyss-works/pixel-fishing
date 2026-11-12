// 요리 규칙 — 해금, 기운 얻기, 조리와 보관, 먹기, 슬롯 효과의 적용 범위.
import { describe, it, expect } from 'vitest';
import { applyAction, drawCatch, namedWeightBonus, prepareCatchDraw } from './actions';
import type { ActionDeps, GameAction } from './actions';
import { FISH, newState } from './logic';
import type { FishInstance, GameState } from './logic';
import {
  COOK_KIND_RULES, COOK_STORAGE_CAP, COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS, ENERGY_PER_INDIVIDUAL, RECIPES, recipeById, toStoredEnergy,
} from '../content/cooking';
import type { RarityId } from '../content/rarity';
import {
  cookingProgress, cookingUnlocked, energyDefaultExcluded, energyTargetRows, energyGain, energyYield, energyTargetOf, settleCooking, slotEffects, appliedSlots,
} from './cooking';
import { effectiveBite } from './stats';
import { SPOTS } from '../content/spots';
import type { PowerZone } from './stats';
import { catchTooSoon } from './pacing';
import { endedFirstCatch } from './firstCatch';
import { NO_GUILD_EFFECTS } from './guild';
import { CATCH_MS, CATCH_MS_BY_RARITY, CATCH_PACING_SLACK_MS } from './balance';
import { mutationWeightsOf } from './logic';
import { MUTATION_WEIGHTS } from './balance';

const T0 = '2026-11-12T00:00:00.000Z';
const at = (base: string, ms: number): string => new Date(Date.parse(base) + ms).toISOString();
const MIN = 60_000;

const deps = (over: Partial<ActionDeps> = {}): ActionDeps => ({
  rng: () => 0.99, today: '2026-11-12', now: T0, newUid: () => 'uid-new', ...over,
});
const home = { kind: 'base', id: 'home' } as const;
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), boat: 5, location: home, ...over });

const fishOf = (rarity: RarityId): string => FISH.find(f => f.rarity === rarity)!.id;
const inst = (uid: string, fishId: string, locked = false): FishInstance =>
  ({ uid, fishId, form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked });
// 등급별 보유 기운 — 인자는 화면 단위(소수 첫째 자리까지)이고, items에는 저장 단위로 넣는다
const energy = (c = 0, r = 0, e = 0, l = 0): Record<string, number> => {
  const out: Record<string, number> = {};
  const put = (id: string, n: number) => { if (n > 0) out[id] = toStoredEnergy(n); };
  put(ENERGY_ITEM_IDS.common, c); put(ENERGY_ITEM_IDS.rare, r); put(ENERGY_ITEM_IDS.epic, e); put(ENERGY_ITEM_IDS.legendary, l);
  return out;
};
const ok = (s: GameState, a: GameAction, d = deps()) => {
  const out = applyAction(s, a, d);
  if (!out.ok) throw new Error(`rejected: ${out.error}`);
  return out;
};
const rejected = (s: GameState, a: GameAction, d = deps()) => {
  const out = applyAction(s, a, d);
  if (out.ok) throw new Error('accepted');
  return out.error;
};

describe('해금', () => {
  it('증기선(5단계)부터 열리고 그 아래는 닫혀 있다', () => {
    expect(COOKING_UNLOCK_BOAT).toBe(5);
    expect(cookingUnlocked(0)).toBe(false);
    expect(cookingUnlocked(4)).toBe(false);
    expect(cookingUnlocked(5)).toBe(true);
    expect(cookingUnlocked(8)).toBe(true);
  });
});

describe('기운 얻기 기본 선택', () => {
  it('배 5는 가장 앞선 해역(인도양) 하나만 뺀다', () => {
    expect(energyDefaultExcluded(5)).toEqual(['indian']);
  });
  it('배 6은 남인도양, 배 7은 코모로 심해 하나만 뺀다', () => {
    expect(energyDefaultExcluded(6)).toEqual(['southindian']);
    expect(energyDefaultExcluded(7)).toEqual(['comorodeep']);
  });
  it('기본값은 제외 해역만 꺼짐이고 나머지는 켜짐이다', () => {
    const s = seed({ boat: 5 });
    expect(energyTargetOf(s, 'indian')).toBe(false);
    expect(energyTargetOf(s, 'barrierreef')).toBe(true);
    expect(energyTargetOf(s, 'coron')).toBe(true);
    expect(energyTargetOf(s, 'pond')).toBe(true);
  });
  it('덮어쓴 값은 배 단계가 바뀌어도 유지되고 덮어쓰지 않은 해역은 새 기본값을 따른다', () => {
    const s = seed({ boat: 5, energyTargets: { indian: true, coron: false } });
    expect(energyTargetOf(s, 'indian')).toBe(true);
    expect(energyTargetOf({ ...s, boat: 7 }, 'indian')).toBe(true);
    expect(energyTargetOf({ ...s, boat: 7 }, 'coron')).toBe(false);
    expect(energyTargetOf({ ...s, boat: 7 }, 'comorodeep')).toBe(false);
    expect(energyTargetOf({ ...s, boat: 7 }, 'mozstrait')).toBe(true);
    expect(energyTargetOf({ ...s, boat: 7 }, 'southindian')).toBe(true);
  });
});

describe('setEnergyTarget와 resetEnergyTargets', () => {
  it('고른 값은 기본값과 같아도 덮어쓰기로 남고, 배 단계가 올라도 그대로 유지된다', () => {
    const on = ok(seed(), { type: 'setEnergyTarget', spot: 'indian', on: true }).state;
    expect(on.energyTargets).toEqual({ indian: true });
    const off = ok(on, { type: 'setEnergyTarget', spot: 'indian', on: false }).state;
    expect(off.energyTargets).toEqual({ indian: false });
    expect(energyTargetOf({ ...off, boat: 7 }, 'indian')).toBe(false);
    expect(energyTargetOf({ ...off, boat: 7 }, 'southindian')).toBe(true);
  });
  it('다른 해역의 덮어쓰기와 모르는 해역 키를 건드리지 않는다', () => {
    const s = seed({ energyTargets: { coron: false, 'future-spot': true } });
    const next = ok(s, { type: 'setEnergyTarget', spot: 'indian', on: true }).state;
    expect(next.energyTargets).toEqual({ coron: false, 'future-spot': true, indian: true });
  });
  it('위치와 무관하게 동작한다', () => {
    const s = seed({ location: { kind: 'region', id: 'world' } });
    expect(ok(s, { type: 'setEnergyTarget', spot: 'indian', on: true }).state.energyTargets).toEqual({ indian: true });
  });
  it('없는 해역, 형식 오류는 bad-request, 해금 전은 cooking-locked다', () => {
    expect(rejected(seed(), { type: 'setEnergyTarget', spot: 'nowhere' as never, on: true })).toBe('bad-request');
    expect(rejected(seed(), { type: 'setEnergyTarget', spot: 'indian', on: 'yes' as never })).toBe('bad-request');
    expect(rejected(seed({ boat: 4 }), { type: 'setEnergyTarget', spot: 'indian', on: true })).toBe('cooking-locked');
  });
  it('기본값으로 되돌리면 덮어쓴 값을 모두 지운다', () => {
    const s = seed({ energyTargets: { indian: true, coron: false } });
    expect(ok(s, { type: 'resetEnergyTargets' }).state.energyTargets).toEqual({});
    expect(rejected(seed({ boat: 4 }), { type: 'resetEnergyTargets' })).toBe('cooking-locked');
  });
});

describe('energyGain', () => {
  it('가방 개체를 등급별로 센다. 잠금, 가방에 없는 uid, 삭제된 어종, 중복 uid는 뺀다', () => {
    const s = seed({ bag: [
      inst('a', fishOf('common')), inst('b', fishOf('common')), inst('c', fishOf('rare')),
      inst('d', fishOf('epic'), true), inst('e', 'deleted-species'), inst('f', fishOf('legendary')),
    ] });
    const g = energyGain(s, ['a', 'b', 'c', 'd', 'e', 'f', 'f', 'ghost']);
    expect(g.byGrade).toEqual({ common: 20, rare: 10, epic: 0, legendary: 10 }); // 저장 단위, 개체 하나에 화면 단위 1
    expect(g.uids.sort()).toEqual(['a', 'b', 'c', 'f']);
  });
  it('전시대 개체는 가방에 없으므로 대상이 아니다', () => {
    const s = seed({ bag: [], exhibit: [inst('x', fishOf('rare'))] });
    expect(energyGain(s, ['x']).uids).toEqual([]);
  });
  it('개체 하나의 산출은 한 곳에 정의한 값(ENERGY_PER_INDIVIDUAL)이다. 잠금과 중복은 산출에서 빠진다', () => {
    const s = seed({ bag: [inst('a', fishOf('epic')), inst('b', fishOf('epic'), true)] });
    expect(energyGain(s, ['a', 'a', 'b']).byGrade.epic).toBe(ENERGY_PER_INDIVIDUAL);
    expect(energyYield(3)).toBe(3 * ENERGY_PER_INDIVIDUAL);
    expect(energyYield(0)).toBe(0);
  });
});

describe('extractEnergy', () => {
  const bag = () => [inst('a', fishOf('common')), inst('b', fishOf('rare')), inst('c', fishOf('epic'), true)];
  it('개체가 사라지고 그 등급의 기운이 쌓인다. 도감, 명성, 골드는 그대로다', () => {
    const s = seed({ bag: bag(), fame: 77, gold: 12, items: { [ENERGY_ITEM_IDS.common]: 30 },
      dex: { [fishOf('common')]: { normal: { count: 4, maxSize: 30, first: '2026-11-01' } } } });
    const out = ok(s, { type: 'extractEnergy', uids: ['a', 'b', 'c'] });
    expect(out.state.bag.map(i => i.uid)).toEqual(['c']);
    expect(out.state.items).toEqual({ [ENERGY_ITEM_IDS.common]: 40, [ENERGY_ITEM_IDS.rare]: 10 });
    expect(out.state.dex).toEqual(s.dex);
    expect(out.state.fame).toBe(77);
    expect(out.state.gold).toBe(12);
    expect(out.result).toEqual({ type: 'extract', energy: { common: 10, rare: 10, epic: 0, legendary: 0 } });
    expect(out.events[0]).toMatchObject({ type: 'extractEnergy', payload: { uids: ['a', 'b'], energy: { common: 10, rare: 10, epic: 0, legendary: 0 } } });
  });
  it('잠근 개체만 고르면 아무것도 바뀌지 않는다', () => {
    const s = seed({ bag: bag() });
    const out = ok(s, { type: 'extractEnergy', uids: ['c'] });
    expect(out.state.bag).toEqual(s.bag);
    expect(out.state.items).toEqual({});
    expect(out.events).toEqual([]);
  });
  it('집 밖, 해금 전, 형식 오류를 거부한다', () => {
    expect(rejected(seed({ bag: bag(), location: { kind: 'base', id: 'harbor' } }),
      { type: 'extractEnergy', uids: ['a'] })).toBe('not-at-home');
    expect(rejected(seed({ bag: bag(), location: { kind: 'region', id: 'world' } }),
      { type: 'extractEnergy', uids: ['a'] })).toBe('not-at-home');
    expect(rejected(seed({ bag: bag(), boat: 4 }), { type: 'extractEnergy', uids: ['a'] })).toBe('cooking-locked');
    expect(rejected(seed({ bag: bag() }), { type: 'extractEnergy', uids: 'a' as never })).toBe('bad-request');
  });
});

describe('cook', () => {
  const R = recipeById('cook-lunch-rare')!; // 일반 100, 희귀 20
  const lunchBite = recipeById('cook-lunch-bite')!; // 일반 600
  const rich = (over: Partial<GameState> = {}) => seed({ items: energy(1000, 1000, 1000, 1000), ...over });

  it('기운을 그 자리에서 모두 차감하고 시작 시각을 서버 시각으로 남긴다', () => {
    const out = ok(rich(), { type: 'cook', recipe: R.id, count: 2 });
    expect(out.state.items[ENERGY_ITEM_IDS.common]).toBe(toStoredEnergy(1000 - 200));
    expect(out.state.items[ENERGY_ITEM_IDS.rare]).toBe(toStoredEnergy(1000 - 40));
    expect(out.state.items[ENERGY_ITEM_IDS.epic]).toBe(toStoredEnergy(1000));
    expect(out.state.cooking).toEqual({ recipe: R.id, count: 2, bonus: [false, false], startedAt: T0 });
    expect(out.events[0]).toMatchObject({ type: 'cook', payload: { recipe: R.id, count: 2 } });
  });
  it('기운이 딱 맞으면 되고 한 개 모자라면 not-enough-energy다', () => {
    const exact = seed({ items: energy(100, 20) });
    expect(ok(exact, { type: 'cook', recipe: R.id, count: 1 }).state.items).toEqual({});
    expect(rejected(seed({ items: energy(100, 19) }), { type: 'cook', recipe: R.id, count: 1 })).toBe('not-enough-energy');
    expect(rejected(seed({ items: energy(100, 20) }), { type: 'cook', recipe: R.id, count: 2 })).toBe('not-enough-energy');
  });
  it('저장 단위 1(화면 단위 0.1)이 모자라도 거부하고, 딱 맞으면 차감 뒤 소수 잔량이 정수로 남는다', () => {
    expect(rejected(seed({ items: energy(99.9, 20) }), { type: 'cook', recipe: R.id, count: 1 })).toBe('not-enough-energy');
    expect(rejected(seed({ items: energy(100, 19.9) }), { type: 'cook', recipe: R.id, count: 1 })).toBe('not-enough-energy');
    const out = ok(seed({ items: energy(100.3, 20.1) }), { type: 'cook', recipe: R.id, count: 1 });
    expect(out.state.items).toEqual({ [ENERGY_ITEM_IDS.common]: 3, [ENERGY_ITEM_IDS.rare]: 1 });
  });
  it('저울이 있으면 수량마다 추가 완성을 추첨해 bonus에 저장하고 기운은 더 쓰지 않는다', () => {
    const s = rich({ artifacts: ['varuna-scale'], items: energy(2000) });
    const draws = [0.05, 0.5, 0.099];
    let i = 0;
    const out = ok(s, { type: 'cook', recipe: lunchBite.id, count: 3 }, deps({ rng: () => draws[i++] }));
    expect(out.state.cooking!.bonus).toEqual([true, false, true]);
    expect(out.state.items[ENERGY_ITEM_IDS.common]).toBe(toStoredEnergy(2000 - 1800));
  });
  it('저울이 없으면 추가 완성이 없다', () => {
    const out = ok(rich({ items: energy(2000) }), { type: 'cook', recipe: lunchBite.id, count: 2 }, deps({ rng: () => 0 }));
    expect(out.state.cooking!.bonus).toEqual([false, false]);
  });
  it('집 밖은 not-at-home, 해금 전은 cooking-locked다', () => {
    expect(rejected(rich({ location: { kind: 'base', id: 'harbor' } }), { type: 'cook', recipe: R.id, count: 1 })).toBe('not-at-home');
    expect(rejected(rich({ boat: 4 }), { type: 'cook', recipe: R.id, count: 1 })).toBe('cooking-locked');
  });
  it('없는 레시피와 잘못된 수량은 bad-request다', () => {
    expect(rejected(rich(), { type: 'cook', recipe: 'nope', count: 1 })).toBe('bad-request');
    expect(rejected(rich(), { type: 'cook', recipe: R.id, count: 0 })).toBe('bad-request');
    expect(rejected(rich(), { type: 'cook', recipe: R.id, count: 1.5 })).toBe('bad-request');
    expect(rejected(rich(), { type: 'cook', recipe: R.id, count: '1' as never })).toBe('bad-request');
  });
  it('보관함 상한(완성품과 조리 중인 수량의 합)을 넘기는 수량은 storage-full이다', () => {
    const full = rich({ items: { ...energy(1000, 1000, 1000, 1000), [R.id]: COOK_STORAGE_CAP } });
    expect(rejected(full, { type: 'cook', recipe: R.id, count: 1 })).toBe('storage-full');
    const nine = rich({ items: { ...energy(1000, 1000, 1000, 1000), [recipeById('cook-bait-mutation')!.id]: 7 } });
    expect(rejected(nine, { type: 'cook', recipe: R.id, count: COOK_STORAGE_CAP - 7 + 1 })).toBe('storage-full');
    expect(ok(nine, { type: 'cook', recipe: R.id, count: COOK_STORAGE_CAP - 7 }).state.cooking!.count).toBe(3);
  });
  it('조리 중인 수량도 보관함에 센다', () => {
    const s = rich({ cooking: { recipe: R.id, count: 9, bonus: Array(9).fill(false), startedAt: T0 } });
    expect(rejected(s, { type: 'cook', recipe: R.id, count: 2 }, deps({ now: at(T0, 10 * MIN) }))).toBe('storage-full');
  });
  it('조리 중이면 새 조리를 시작할 수 없다. 모두 완성되면 시작할 수 있다', () => {
    const wait = COOK_KIND_RULES.lunch.waitMs;
    const s = rich({ cooking: { recipe: R.id, count: 2, bonus: [false, false], startedAt: T0 } });
    expect(rejected(s, { type: 'cook', recipe: R.id, count: 1 }, deps({ now: at(T0, wait) }))).toBe('cooking-busy');
    expect(rejected(s, { type: 'cook', recipe: R.id, count: 1 }, deps({ now: at(T0, 2 * wait - 1) }))).toBe('cooking-busy');
    const next = ok(s, { type: 'cook', recipe: R.id, count: 1 }, deps({ now: at(T0, 2 * wait) })).state;
    expect(next.items[R.id]).toBe(2); // 앞 조리는 보관함으로 들어갔다
    expect(next.cooking).toMatchObject({ recipe: R.id, count: 1, startedAt: at(T0, 2 * wait) });
  });
});

describe('조리 진행과 완성', () => {
  const lunch = recipeById('cook-lunch-bite')!;
  const miniBait = recipeById('cook-bait-mutation')!;
  const W = COOK_KIND_RULES.lunch.waitMs;
  const cooking = (count: number, bonus: boolean[], recipe = lunch.id) =>
    seed({ cooking: { recipe, count, bonus, startedAt: T0 } });

  it('완성 수는 경과 시간을 레시피 1개의 대기로 나눈 몫이고 넣은 수량을 넘지 않는다', () => {
    const s = cooking(3, [false, false, false]);
    expect(cookingProgress(s, at(T0, W - 1))).toMatchObject({ completed: 0, ready: 0, pending: 3 });
    expect(cookingProgress(s, at(T0, W))).toMatchObject({ completed: 1, ready: 1, pending: 2 });
    expect(cookingProgress(s, at(T0, 2.5 * W))).toMatchObject({ completed: 2, ready: 2, pending: 1 });
    expect(cookingProgress(s, at(T0, 100 * W))).toMatchObject({ completed: 3, ready: 3, pending: 0, nextAt: null });
  });
  it('다음 완성 시각과 모두 완성되는 시각을 알려 준다', () => {
    const p = cookingProgress(cooking(3, [false, false, false]), at(T0, W + 5))!;
    expect(p.nextAt).toBe(at(T0, 2 * W));
    expect(p.finishAt).toBe(at(T0, 3 * W));
    expect(cookingProgress(seed(), T0)).toBeNull();
  });
  it('시작 시각 이전의 시계는 0개 완성으로 본다', () => {
    expect(cookingProgress(cooking(2, [false, false]), at(T0, -W))).toMatchObject({ completed: 0, ready: 0 });
  });
  it('추가 완성분은 그 1개가 완성될 때 함께 완성된다', () => {
    const s = cooking(3, [false, true, false]);
    expect(cookingProgress(s, at(T0, W))!.ready).toBe(1);
    expect(cookingProgress(s, at(T0, 2 * W))!.ready).toBe(3);
    expect(cookingProgress(s, at(T0, 3 * W))!.ready).toBe(4);
  });
  it('settleCooking은 완성품을 보관함(items)으로 옮기고 남은 조리의 시작 시각을 이어 붙인다', () => {
    const s = cooking(3, [false, true, false]);
    const mid = settleCooking(s, at(T0, 2 * W + 1));
    expect(mid.items[lunch.id]).toBe(3);
    expect(mid.cooking).toEqual({ recipe: lunch.id, count: 1, bonus: [false], startedAt: at(T0, 2 * W) });
    const done = settleCooking(mid, at(T0, 3 * W));
    expect(done.items[lunch.id]).toBe(4);
    expect(done.cooking).toBeNull();
  });
  it('아직 완성된 것이 없으면 같은 상태를 그대로 돌려준다', () => {
    const s = cooking(2, [false, false]);
    expect(settleCooking(s, at(T0, W - 1))).toBe(s);
    const idle = seed();
    expect(settleCooking(idle, T0)).toBe(idle);
  });
  it('미끼 요리는 15분마다 완성된다', () => {
    const s = cooking(2, [false, false], miniBait.id);
    expect(cookingProgress(s, at(T0, 15 * MIN))).toMatchObject({ completed: 1 });
  });
});

describe('eat', () => {
  const lunch = recipeById('cook-lunch-bite')!;
  const bait = recipeById('cook-bait-mutation')!;
  it('도시락은 도시락 슬롯에 9시간, 미끼 요리는 미끼 슬롯에 30분 들어가고 1개 줄어든다', () => {
    const s = seed({ items: { [lunch.id]: 2, [bait.id]: 1 } });
    const a = ok(s, { type: 'eat', item: lunch.id });
    expect(a.state.slots.lunch).toEqual({ id: lunch.id, endsAt: at(T0, 9 * 60 * MIN) });
    expect(a.state.slots.bait).toBeNull();
    expect(a.state.items[lunch.id]).toBe(1);
    const b = ok(a.state, { type: 'eat', item: bait.id });
    expect(b.state.slots.bait).toEqual({ id: bait.id, endsAt: at(T0, 30 * MIN) });
    expect(b.state.items[bait.id]).toBeUndefined();
    expect(a.events[0]).toMatchObject({ type: 'eat', payload: { item: lunch.id } });
  });
  it('감사 이벤트의 replaced는 이전 슬롯 효과가 끝나기 전일 때만 이전 id를 남긴다', () => {
    const other = recipeById('cook-lunch-rare')!;
    const s = seed({ items: { [other.id]: 1 }, slots: { lunch: { id: lunch.id, endsAt: at(T0, 60 * MIN) }, bait: null } });
    expect(ok(s, { type: 'eat', item: other.id }, deps({ now: at(T0, 30 * MIN) })).events[0])
      .toMatchObject({ payload: { replaced: lunch.id } });
    expect(ok(s, { type: 'eat', item: other.id }, deps({ now: at(T0, 90 * MIN) })).events[0])
      .toMatchObject({ payload: { replaced: null } });
  });
  it('끝나는 시각은 UTC ISO로 저장한다', () => {
    const out = ok(seed({ items: { [lunch.id]: 1 } }), { type: 'eat', item: lunch.id }, deps({ now: '2026-11-12T08:30:15.123Z' }));
    expect(out.state.slots.lunch!.endsAt).toBe('2026-11-12T17:30:15.123Z');
  });
  it('이미 든 슬롯에 넣으면 이전 효과는 즉시 끝나고 남은 시간은 사라진다. 같은 것을 다시 넣어도 같다', () => {
    const other = recipeById('cook-lunch-rare')!;
    const s = seed({ items: { [lunch.id]: 2, [other.id]: 1 }, slots: { lunch: { id: lunch.id, endsAt: at(T0, 8 * 60 * MIN) }, bait: null } });
    const swapped = ok(s, { type: 'eat', item: other.id }, deps({ now: at(T0, 60 * MIN) })).state;
    expect(swapped.slots.lunch).toEqual({ id: other.id, endsAt: at(T0, 60 * MIN + 9 * 60 * MIN) });
    const again = ok(s, { type: 'eat', item: lunch.id }, deps({ now: at(T0, 60 * MIN) })).state;
    expect(again.slots.lunch!.endsAt).toBe(at(T0, 60 * MIN + 9 * 60 * MIN));
  });
  it('조리가 끝난 완성품을 먼저 정산한 뒤 먹는다', () => {
    const s = seed({ cooking: { recipe: lunch.id, count: 1, bonus: [false], startedAt: T0 } });
    const out = ok(s, { type: 'eat', item: lunch.id }, deps({ now: at(T0, COOK_KIND_RULES.lunch.waitMs) }));
    expect(out.state.slots.lunch).not.toBeNull();
    expect(out.state.cooking).toBeNull();
    expect(out.state.items[lunch.id]).toBeUndefined();
  });
  it('위치 제한은 없다', () => {
    const s = seed({ items: { [lunch.id]: 1 }, location: { kind: 'region', id: 'world' } });
    expect(ok(s, { type: 'eat', item: lunch.id }).state.slots.lunch).not.toBeNull();
  });
  it('보유하지 않았으면 item-not-owned, 해금 전은 cooking-locked, 먹을 수 없는 아이템은 bad-request다', () => {
    expect(rejected(seed(), { type: 'eat', item: lunch.id })).toBe('item-not-owned');
    expect(rejected(seed({ boat: 4, items: { [lunch.id]: 1 } }), { type: 'eat', item: lunch.id })).toBe('cooking-locked');
    expect(rejected(seed({ items: energy(5) }), { type: 'eat', item: ENERGY_ITEM_IDS.common })).toBe('bad-request');
    expect(rejected(seed(), { type: 'eat', item: 7 as never })).toBe('bad-request');
  });
});

describe('slotEffects', () => {
  const lunchBite = recipeById('cook-lunch-bite')!;
  const lunchRare = recipeById('cook-lunch-rare')!;
  const bundle = recipeById('cook-lunch-bundle')!;
  const baitMut = recipeById('cook-bait-mutation')!;
  const baitRare = recipeById('cook-bait-rare')!;
  const slots = (lunch: string | null, bait: string | null, endsAt = at(T0, 60 * MIN)): GameState['slots'] => ({
    lunch: lunch ? { id: lunch, endsAt } : null, bait: bait ? { id: bait, endsAt } : null,
  });

  it('슬롯이 비어 있으면 효과가 없다', () => {
    expect(slotEffects(seed(), T0, 'auto')).toEqual({
      biteWaitCut: 0, rarityWeight: {}, mutationWeight: 0, namedWeight: 0,
    });
  });
  it('도시락은 방치(auto) 판정에만, 미끼 슬롯은 수동 판정에만 적용한다', () => {
    const s = seed({ slots: slots(lunchBite.id, baitMut.id) });
    expect(slotEffects(s, T0, 'auto')).toMatchObject({ biteWaitCut: 0.1, mutationWeight: 0 });
    for (const j of ['perfect', 'good', 'normal'] as const) {
      expect(slotEffects(s, T0, j)).toMatchObject({ biteWaitCut: 0, mutationWeight: 1 });
    }
  });
  it('끝나는 시각 이후에는 적용하지 않는다(같은 시각 포함)', () => {
    const s = seed({ slots: slots(lunchBite.id, null) });
    expect(slotEffects(s, at(T0, 60 * MIN - 1), 'auto').biteWaitCut).toBe(0.1);
    expect(slotEffects(s, at(T0, 60 * MIN), 'auto').biteWaitCut).toBe(0);
    expect(slotEffects(s, at(T0, 61 * MIN), 'auto').biteWaitCut).toBe(0);
  });
  it('읽을 수 없는 시각은 적용하지 않는다', () => {
    const s = seed({ slots: slots(lunchBite.id, null, 'garbage') });
    expect(slotEffects(s, T0, 'auto').biteWaitCut).toBe(0);
    expect(slotEffects(seed({ slots: slots(lunchBite.id, null) }), 'garbage', 'auto').biteWaitCut).toBe(0);
  });
  it('등급 가중은 그 등급부터 전설까지에 걸린다', () => {
    expect(slotEffects(seed({ slots: slots(lunchRare.id, null) }), T0, 'auto').rarityWeight)
      .toEqual({ rare: 0.1, epic: 0.1, legendary: 0.1 });
    expect(slotEffects(seed({ slots: slots(null, baitRare.id) }), T0, 'normal').rarityWeight)
      .toEqual({ rare: 0.2, epic: 0.2, legendary: 0.2 });
  });
  it('묶음 도시락은 입질 단축과 희귀 이상 등급 가중을 함께 낸다', () => {
    expect(slotEffects(seed({ slots: slots(bundle.id, null) }), T0, 'auto')).toMatchObject({
      biteWaitCut: 0.05, rarityWeight: { rare: 0.05, epic: 0.05, legendary: 0.05 },
    });
  });
  it('네임드 조우와 돌연변이 가중은 효과 표의 값이다', () => {
    expect(slotEffects(seed({ slots: slots('cook-lunch-named', null) }), T0, 'auto').namedWeight).toBe(0.5);
    expect(slotEffects(seed({ slots: slots('cook-lunch-mutation', null) }), T0, 'auto').mutationWeight).toBe(0.5);
  });
  it('모든 레시피 효과 키를 낸다', () => {
    for (const r of RECIPES) {
      const slot = r.kind === 'lunch' ? slots(r.id, null) : slots(null, r.id);
      const e = slotEffects(seed({ slots: slot }), T0, r.kind === 'lunch' ? 'auto' : 'good');
      expect(e.biteWaitCut, r.id).toBe(r.effects.biteWaitCut ?? 0);
      expect(e.mutationWeight, r.id).toBe(r.effects.mutationWeight ?? 0);
      expect(e.namedWeight, r.id).toBe(r.effects.namedWeight ?? 0);
    }
  });
});

describe('효과 합산', () => {
  it('입질 단축 도시락 −10%와 입질 대기 −10% 유물은 더해 ×0.8로 적용한다', () => {
    const plain = effectiveBite(seed(), 'pond').min.value;
    const relic = seed({ artifacts: ['outer-isle-sinker'] });
    expect(effectiveBite(relic, 'pond').min.value).toBeCloseTo(plain * 0.9, 9);
    const cook = slotEffects(seed({ slots: { lunch: { id: 'cook-lunch-bite', endsAt: at(T0, 60 * MIN) }, bait: null } }), T0, 'auto');
    expect(effectiveBite(seed(), 'pond', cook).min.value).toBeCloseTo(plain * 0.9, 9);
    expect(effectiveBite(relic, 'pond', cook).min.value).toBeCloseTo(plain * 0.8, 9);
  });
  it('돌연변이 가중은 유물과 슬롯을 더한 값이 0보다 크면 전역 가중치에 (1 + 합)을 곱하고 해역 덮어쓰기를 쓰지 않는다', () => {
    const relic = seed({ artifacts: ['elder-scale'] }); // +25% (Lv1)
    expect(mutationWeightsOf(relic, 'pond', 0.5)).toEqual({
      variant: MUTATION_WEIGHTS.variant * 1.75, normal: MUTATION_WEIGHTS.normal,
    });
    expect(mutationWeightsOf(seed(), 'pond', 1)).toEqual({
      variant: MUTATION_WEIGHTS.variant * 2, normal: MUTATION_WEIGHTS.normal,
    });
    expect(mutationWeightsOf(seed(), 'pond', 0)).toEqual(mutationWeightsOf(seed(), 'pond'));
  });
});

describe('캐치에 적용', () => {
  const PZ: PowerZone = { power: 10, req: 10, yellow: 10, red: 5, mult: 1, biteExtra: 0 };
  const LATER = at(T0, 30 * MIN);
  const withSlots = (lunch: string | null, bait: string | null, endsAt = at(T0, 60 * MIN)) =>
    seed({ slots: { lunch: lunch ? { id: lunch, endsAt } : null, bait: bait ? { id: bait, endsAt } : null } });

  it('등급 가중 도시락은 방치 캐치의 등급 가중치에만 걸린다', () => {
    const s = withSlots('cook-lunch-rare', null);
    expect(prepareCatchDraw(s, 'auto', LATER, PZ).phaseOpts.weightEffects)
      .toEqual({ rare: 0.1, epic: 0.1, legendary: 0.1 });
    for (const j of ['perfect', 'good', 'normal'] as const) {
      expect(prepareCatchDraw(s, j, LATER, PZ).phaseOpts.weightEffects).toBeUndefined();
    }
  });
  it('등급 미끼는 수동 캐치에만 걸리고 방치 캐치에는 걸리지 않는다', () => {
    const s = withSlots(null, 'cook-bait-epic');
    expect(prepareCatchDraw(s, 'good', LATER, PZ).phaseOpts.weightEffects).toEqual({ epic: 0.4, legendary: 0.4 });
    expect(prepareCatchDraw(s, 'auto', LATER, PZ).phaseOpts.weightEffects).toBeUndefined();
  });
  it('슬롯이 끝난 뒤에는 적용하지 않는다. 판정 시각은 서버 시각(now) 인자만 본다', () => {
    const s = withSlots(null, 'cook-bait-epic', at(T0, 30 * MIN));
    expect(prepareCatchDraw(s, 'good', at(T0, 30 * MIN), PZ).phaseOpts.weightEffects).toBeUndefined();
    expect(prepareCatchDraw(s, 'good', at(T0, 29 * MIN), PZ).phaseOpts.weightEffects).toEqual({ epic: 0.4, legendary: 0.4 });
  });
  it('효과가 없으면 추첨 옵션은 시간대만 담는다', () => {
    expect(Object.keys(prepareCatchDraw(seed(), 'auto', LATER, PZ).phaseOpts)).toEqual(['phase']);
  });
  it('판정 강등 규칙은 그대로다', () => {
    expect(prepareCatchDraw(seed(), 'perfect', LATER, { ...PZ, red: 0 }).judgment).toBe('good');
  });

  it('네임드 조우 가중은 길드 값과 더한다. 도시락은 방치 캐치에만 걸린다', () => {
    const s = withSlots('cook-lunch-named', null);
    expect(namedWeightBonus(s, 'auto', LATER, { ...NO_GUILD_EFFECTS, named: 0.1 })).toBeCloseTo(0.6, 9);
    expect(namedWeightBonus(s, 'good', LATER, { ...NO_GUILD_EFFECTS, named: 0.1 })).toBeCloseTo(0.1, 9);
    expect(namedWeightBonus(seed(), 'auto', LATER, NO_GUILD_EFFECTS)).toBe(0);
  });

  it('돌연변이 가중 슬롯은 폼 추첨의 가중치를 키운다', () => {
    const state = { ...seed(), firstCatch: endedFirstCatch() };
    const base = MUTATION_WEIGHTS.variant / (MUTATION_WEIGHTS.variant + MUTATION_WEIGHTS.normal);
    const boosted = (MUTATION_WEIGHTS.variant * 2) / (MUTATION_WEIGHTS.variant * 2 + MUTATION_WEIGHTS.normal);
    const r = (base + boosted) / 2;
    const run = (slots: GameState['slots']) => {
      const s = { ...state, slots };
      const prep = prepareCatchDraw(s, 'normal', LATER, PZ);
      return drawCatch(s, 'pond', prep.judgment, 100, 1, () => r, prep.phaseOpts, () => false, NO_GUILD_EFFECTS, prep.cook)
        .extras.form;
    };
    expect(run({ lunch: null, bait: null })).toBe('normal');
    expect(run({ lunch: null, bait: { id: 'cook-bait-mutation', endsAt: at(T0, 60 * MIN) } })).toBe('variant');
  });

  it('캐치 간격 검사는 활성 도시락의 입질 단축을 판정과 관계없이 넣는다', () => {
    const plain = seed();
    const lunch = withSlots('cook-lunch-bite', null, at(T0, 9 * 60 * MIN));
    const biteMs = effectiveBite(plain, 'pond').min.value * 1000;
    const showMs = Math.min(CATCH_MS, ...Object.values(CATCH_MS_BY_RARITY));
    const thresholdPlain = showMs + biteMs - CATCH_PACING_SLACK_MS;
    const thresholdLunch = showMs + biteMs * 0.9 - CATCH_PACING_SLACK_MS;
    const gap = (thresholdPlain + thresholdLunch) / 2;
    const now = at(T0, gap);
    expect(catchTooSoon(plain, 'pond', T0, now)).toBe(true);
    expect(catchTooSoon(lunch, 'pond', T0, now)).toBe(false);
    // 단축 폭보다 이른 간격은 도시락이 있어도 막는다
    expect(catchTooSoon(lunch, 'pond', T0, at(T0, thresholdLunch - 1000))).toBe(true);
  });
  it('끝난 도시락의 단축은 페이싱에 넣지 않는다', () => {
    const ended = withSlots('cook-lunch-bite', null, at(T0, 1 * MIN));
    const biteMs = effectiveBite(seed(), 'pond').min.value * 1000;
    const showMs = Math.min(CATCH_MS, ...Object.values(CATCH_MS_BY_RARITY));
    const gap = (2 * showMs + 1.9 * biteMs) / 2 - CATCH_PACING_SLACK_MS;
    const lastCatch = at(T0, 10 * MIN);
    const now = at(lastCatch, gap);
    expect(catchTooSoon(ended, 'pond', lastCatch, now)).toBe(true);
  });
});

describe('appliedSlots', () => {
  const slot = (id: string, endsAt = at(T0, 60 * MIN)) => ({ id, endsAt });
  const both = (endsAt?: string): GameState['slots'] => ({ lunch: slot('cook-lunch-bite', endsAt), bait: slot('cook-bait-mutation', endsAt) });

  it('방치(auto)는 도시락만, 수동은 미끼만 돌려준다', () => {
    const s = seed({ slots: both() });
    expect(appliedSlots(s, T0, 'auto')).toEqual({ lunch: 'cook-lunch-bite' });
    for (const j of ['perfect', 'good', 'normal'] as const) expect(appliedSlots(s, T0, j)).toEqual({ bait: 'cook-bait-mutation' });
  });
  it('슬롯이 비었거나 끝나는 시각 이후(같은 시각 포함)면 비어 있다', () => {
    expect(appliedSlots(seed(), T0, 'auto')).toEqual({});
    const s = seed({ slots: both() });
    expect(appliedSlots(s, at(T0, 60 * MIN - 1), 'auto')).toEqual({ lunch: 'cook-lunch-bite' });
    expect(appliedSlots(s, at(T0, 60 * MIN), 'auto')).toEqual({});
    expect(appliedSlots(s, at(T0, 61 * MIN), 'normal')).toEqual({});
  });
  it('읽을 수 없는 시각이나 모르는 요리 id는 적용하지 않는다', () => {
    expect(appliedSlots(seed({ slots: both('garbage') }), T0, 'auto')).toEqual({});
    expect(appliedSlots(seed({ slots: both() }), 'garbage', 'auto')).toEqual({});
    expect(appliedSlots(seed({ slots: { lunch: slot('nope'), bait: null } }), T0, 'auto')).toEqual({});
  });
  it('slotEffects와 같은 슬롯을 적용한다', () => {
    const s = seed({ slots: both() });
    for (const j of ['auto', 'good'] as const) {
      const eff = slotEffects(s, T0, j);
      expect(Object.keys(appliedSlots(s, T0, j)).length > 0).toBe(eff.biteWaitCut > 0 || eff.mutationWeight > 0);
    }
  });
});

describe('energyTargetRows', () => {
  it('갈 수 있는 해역을 해역 순서로, 켜짐 여부와 기본값 여부와 덮어쓰기 여부와 함께 돌려준다', () => {
    const rows = energyTargetRows(seed({ boat: 5, energyTargets: { indian: true, coron: false, 'future-spot': true } }));
    expect(rows.map(r => r.spot)).toEqual(SPOTS.filter(s => s.boatTier <= 5).map(s => s.id));
    const by = (id: string) => rows.find(r => r.spot === id)!;
    expect(by('indian')).toEqual({ spot: 'indian', on: true, isDefault: false, overridden: true });
    expect(by('barrierreef')).toEqual({ spot: 'barrierreef', on: true, isDefault: true, overridden: false });
    expect(by('coron')).toEqual({ spot: 'coron', on: false, isDefault: false, overridden: true });
    expect(by('pond')).toEqual({ spot: 'pond', on: true, isDefault: true, overridden: false });
  });
});
