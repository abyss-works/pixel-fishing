// 가방 초과 때의 자동 기운 얻기 — 가공 플랜트선을 가진 플레이어가 내보낼 개체가 기운 대상이면 놓아주는 대신 기운을 얻는다.
import { describe, it, expect } from 'vitest';
import { applyAction } from './actions';
import type { ActionDeps } from './actions';
import { BOATS, newState } from './logic';
import type { FishInstance, GameState } from './logic';
import { AUTO_ENERGY_BOAT, ENERGY_ITEM_IDS, ENERGY_PER_INDIVIDUAL } from '../content/cooking';
import { energyGain, planOverflow } from './cooking';
import { summarizeAway } from './away';

const deps = (over: Partial<ActionDeps> = {}): ActionDeps => {
  let n = 0;
  return { rng: () => 0, today: '2026-11-14', now: '2026-11-14T03:00:00.000Z', newUid: () => `uid-${++n}`, ...over };
};
const mk = (uid: string, fishId: string, locked = false): FishInstance =>
  ({ uid, fishId, form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked });
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const fullBag = (boat: number, fishId = 'crucian'): FishInstance[] =>
  Array.from({ length: BOATS[boat - 1].bagCap }, (_, i) => mk(`old-${i}`, fishId));
const catchPond = (s: GameState, d = deps()) => {
  const out = applyAction(s, { type: 'catch', spot: 'pond', judgment: 'normal' }, d);
  if (!out.ok) throw new Error(out.error);
  if (out.result.type !== 'catch') throw new Error('catch 결과가 아님');
  return { out, result: out.result };
};

describe('가공 플랜트선', () => {
  it('자동 기운 얻기가 열리는 배는 9단계 가공 플랜트선이다', () => {
    expect(AUTO_ENERGY_BOAT).toBe(9);
    expect(BOATS[AUTO_ENERGY_BOAT - 1].name).toBe('가공 플랜트선');
  });
});

describe('planOverflow — 내보낼 개체를 놓아줄 것과 기운으로 바꿀 것으로 나눈다', () => {
  const bag = [mk('a', 'crucian'), mk('b', 'apollodamsel'), mk('c', 'carp')];
  const state = (over: Partial<GameState> = {}) => seed({ boat: 9, bag, ...over });

  it('가공 플랜트선이 없으면 모두 놓아준다', () => {
    const plan = planOverflow(state({ boat: 8 }), ['a', 'c'], false);
    expect(plan.released).toEqual(['a', 'c']);
    expect(plan.gain.uids).toEqual([]);
  });

  it('가공 플랜트선이 있으면 기운 대상 해역의 개체는 기운이 되고 등급별 양은 판매 시설과 같다', () => {
    const plan = planOverflow(state(), ['a', 'c'], false);
    expect(plan.released).toEqual([]);
    expect(plan.gain.uids).toEqual(['a', 'c']);
    expect(plan.gain).toEqual(energyGain(state(), ['a', 'c']));
    expect(plan.gain.byGrade.common).toBe(ENERGY_PER_INDIVIDUAL);
    expect(plan.gain.byGrade.rare).toBe(ENERGY_PER_INDIVIDUAL);
  });

  it('기본값에서 꺼진 해역(가장 앞선 해역)의 개체는 놓아준다', () => {
    const plan = planOverflow(state(), ['b'], false);
    expect(plan.released).toEqual(['b']);
    expect(plan.gain.uids).toEqual([]);
  });

  it('덮어쓴 설정을 따른다 - 끈 해역은 놓아주고 켠 해역은 기운이 된다', () => {
    const off = planOverflow(state({ energyTargets: { pond: false } }), ['a'], false);
    expect(off.released).toEqual(['a']);
    const on = planOverflow(state({ energyTargets: { sthelena: true } }), ['b'], false);
    expect(on.gain.uids).toEqual(['b']);
  });

  it('게스트는 가공 플랜트선이 있어도 놓아준다', () => {
    const plan = planOverflow(state(), ['a'], true);
    expect(plan.released).toEqual(['a']);
    expect(plan.gain.uids).toEqual([]);
  });

  it('내보낼 개체가 없으면 빈 결과다', () => {
    expect(planOverflow(state(), [], false)).toEqual({ released: [], gain: energyGain(state(), []) });
  });
});

describe('catch - 가방이 가득 찬 가공 플랜트선', () => {
  it('내보낼 개체가 기운 대상이면 기운을 얻고 결과, 이벤트, 가방에 남는다', () => {
    const { out, result } = catchPond(seed({ boat: 9, bag: fullBag(9) }));
    expect(result.released).toEqual([]);
    expect(result.extracted).toHaveLength(1);
    expect(result.extracted![0].uid).toMatch(/^old-/);
    expect(result.energy).toMatchObject({ common: ENERGY_PER_INDIVIDUAL, rare: 0, epic: 0, legendary: 0 });
    expect(out.state.bag).toHaveLength(BOATS[8].bagCap);
    expect(out.state.items[ENERGY_ITEM_IDS.common]).toBe(ENERGY_PER_INDIVIDUAL);
    expect(out.writes.instancesRemoved).toEqual([result.extracted![0].uid]);
    expect(out.events.map(e => e.type)).toEqual(['catch', 'autoExtractEnergy']);
    expect(out.events[1].payload).toMatchObject({
      uids: [result.extracted![0].uid], reason: 'bag-full',
      energy: { common: ENERGY_PER_INDIVIDUAL, rare: 0, epic: 0, legendary: 0 },
      fish: [{ uid: result.extracted![0].uid, fishId: 'crucian', form: 'normal' }],
    });
    // 도감과 명성은 남는다
    expect(out.state.fame).toBeGreaterThan(0);
    expect(out.state.dex.crucian?.variant?.count).toBe(1);
  });

  it('내보낼 개체가 기운 대상이 아니면 놓아준다', () => {
    const { out, result } = catchPond(seed({ boat: 9, bag: fullBag(9), energyTargets: { pond: false } }));
    expect(result.released).toHaveLength(1);
    expect(result.extracted ?? []).toEqual([]);
    expect(result.energy).toBeUndefined();
    expect(out.events.map(e => e.type)).toEqual(['catch', 'autoRelease']);
    expect(out.state.items[ENERGY_ITEM_IDS.common]).toBeUndefined();
  });

  it('기운 대상이 아닌 개체를 건너뛰고 다른 개체를 고르지 않는다 - 가장 안 특별한 개체 하나만 본다', () => {
    // 일반 붕어(연못, 기운 대상 꺼짐)가 가장 안 특별하다. 기운 대상인 개체가 가방에 더 있어도 붕어를 놓아준다.
    const bag = [...fullBag(9, 'carp').slice(1), mk('plain', 'crucian')];
    const { out, result } = catchPond(seed({ boat: 9, bag, energyTargets: { pond: false } }));
    expect(result.released.map(r => r.uid)).toEqual(['plain']);
    expect(out.state.items[ENERGY_ITEM_IDS.rare]).toBeUndefined();
  });

  it('게스트는 놓아준다', () => {
    const { out, result } = catchPond(seed({ boat: 9, bag: fullBag(9) }), deps({ guest: true }));
    expect(result.released).toHaveLength(1);
    expect(result.extracted ?? []).toEqual([]);
    expect(out.events.map(e => e.type)).toEqual(['catch', 'autoRelease']);
  });

  it('대양 트롤선(8단계)은 놓아준다', () => {
    const { out, result } = catchPond(seed({ boat: 8, bag: fullBag(8) }));
    expect(result.released).toHaveLength(1);
    expect(out.events.map(e => e.type)).toEqual(['catch', 'autoRelease']);
  });

  it('방금 잡은 개체가 가장 안 특별해 그 자리에서 나가도 기운 대상이면 기운이 된다', () => {
    // 가방을 희귀 개체로 채우면 새로 잡은 일반 개체(붕어)가 가장 안 특별하다
    const { out, result } = catchPond(seed({ boat: 9, bag: fullBag(9, 'carp') }));
    expect(result.uid).toBe('uid-1');
    expect(result.released).toEqual([]);
    expect(result.extracted!.map(r => r.uid)).toEqual(['uid-1']);
    expect(out.state.bag.some(i => i.uid === 'uid-1')).toBe(false);
    expect(out.state.items[ENERGY_ITEM_IDS.common]).toBe(ENERGY_PER_INDIVIDUAL);
  });
});

describe('방치 결과 - 기운으로 바꾼 개체를 놓아준 개체와 구분한다', () => {
  const window = { from: '2026-11-14T00:00:00.000Z', to: '2026-11-14T02:00:00.000Z', awayMs: 2 * 3_600_000 };
  const at = (min: number) => new Date(Date.parse(window.from) + min * 60_000).toISOString();
  const energy = { common: 10, rare: 0, epic: 0, legendary: 0 };

  it('기운으로 바꾼 수와 등급별 양을 따로 센다', () => {
    const s = summarizeAway([
      { type: 'autoRelease', at: at(50), payload: { uids: ['r1'], fish: [{ uid: 'r1', fishId: 'crucian', form: 'normal' }] } },
      { type: 'autoExtractEnergy', at: at(20), payload: { uids: ['e1', 'e2'], energy: { common: 10, rare: 10, epic: 0, legendary: 0 }, fish: [] } },
      { type: 'autoExtractEnergy', at: at(30), payload: { uids: ['e3'], energy, fish: [] } },
    ], window);
    expect(s.released.count).toBe(1);
    expect(s.extracted.count).toBe(3);
    expect(s.extracted.energy).toEqual({ common: 20, rare: 10, epic: 0, legendary: 0 });
  });

  it('가방이 찬 시각은 첫 자동 방생과 첫 자동 기운 얻기 중 먼저 일어난 시각이다', () => {
    const release = { type: 'autoRelease', at: at(50), payload: { uids: ['r1'], fish: [] } };
    const extract = { type: 'autoExtractEnergy', at: at(20), payload: { uids: ['e1'], energy, fish: [] } };
    expect(summarizeAway([release, extract], window).bagFullAfterMs).toBe(20 * 60_000);
    expect(summarizeAway([extract], window).bagFullAfterMs).toBe(20 * 60_000);
    expect(summarizeAway([release], window).bagFullAfterMs).toBe(50 * 60_000);
    expect(summarizeAway([], window).bagFullAfterMs).toBeNull();
  });
});
