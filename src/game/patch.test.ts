// 델타 동등성 — applyPatch(prev, pickScalars(next), writes) ≡ next
// 서버가 델타만 보내도 클라가 풀 상태를 비트 단위로 복원함을 액션 14종 + 전시 합성으로 보장한다.
// 규칙 자체는 actions.test.ts 소관 — 여기는 "전송 생략분 없음"만 본다 (유스케이스 0변화의 근거).
import { describe, it, expect } from 'vitest';
import { applyAction, pickScalars, applyPatch } from './actions';
import type { ActionDeps, GameAction, StatePatch } from './actions';
import { newState, WALK_BAG_CAP } from './logic';
import type { FishInstance, FormId, GameState } from './logic';

const deps = (over: Partial<ActionDeps> = {}): ActionDeps => {
  let n = 0;
  return {
    rng: () => 0, today: '2026-08-22', now: '2026-08-22T03:00:00.000Z',
    newUid: () => `uid-${++n}`, ...over,
  };
};

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

const mkInst = (uid: string, fishId = 'carp', form: FormId = 'normal', locked = false): FishInstance =>
  ({ uid, fishId, form, size: 20, caughtAt: null, spot: null, judgment: null, locked });

/** 리듀서 → 델타 → 복원이 풀 상태와 같은지. 실패 원인은 규칙이 아니라 전송이어야 한다 */
const check = (prev: GameState, action: GameAction, over: Partial<ActionDeps> = {}): void => {
  const out = applyAction(prev, action, deps(over));
  if (!out.ok) throw new Error(`unexpected reject: ${out.error}`);
  const patch: StatePatch = { version: 2, baseVersion: 1, scalars: pickScalars(out.state), writes: out.writes };
  expect(applyPatch(prev, patch)).toEqual(out.state);
};

describe('patch 동등성 — 전 액션', () => {
  it('catch — 추첨+개체+도감+명성', () => {
    check(seed(), { type: 'catch', spot: 'pond', judgment: 'normal' });
  });
  it('catch — 방치 판정 + 미끼 없음', () => {
    check(seed(), { type: 'catch', spot: 'river', judgment: 'auto' });
  });
  it('catch — 가방 가득 방생 1마리', () => {
    const bag = Array.from({ length: WALK_BAG_CAP }, (_, i) => mkInst(`b${i}`));
    check(seed({ bag }), { type: 'catch', spot: 'pond', judgment: 'normal' });
  });
  it('catch — 전부 잠그면 넘쳐도 방생 없음', () => {
    const bag = Array.from({ length: WALK_BAG_CAP }, (_, i) => mkInst(`b${i}`, 'carp', 'normal', true));
    check(seed({ bag }), { type: 'catch', spot: 'pond', judgment: 'normal' });
  });
  it('sell — 부분 판매', () => {
    check(seed({ bag: [mkInst('a'), mkInst('b', 'carp', 'normal', true)] }), { type: 'sell', uids: ['a', 'b'] });
  });
  it('setLocked — 일괄 지정', () => {
    check(seed({ bag: [mkInst('a'), mkInst('b')] }), { type: 'setLocked', uids: ['a', 'b'], locked: true });
  });
  it('upgradeRod / buyBoat — 스칼라만', () => {
    check(seed({ gold: 1e9 }), { type: 'upgradeRod' });
    check(seed({ gold: 1e9, fame: 0 }), { type: 'buyBoat' });
  });
  it('travel — 위치+방문', () => {
    check(seed(), { type: 'travel', to: { kind: 'base', id: 'harbor' } });
  });
  it('buyBait / setActiveBait — 아이템+활성', () => {
    const base = seed({ gold: 1e6, location: { kind: 'base', id: 'colombo' } });
    const out = applyAction(base, { type: 'buyBait', bait: 'bait-common', count: 2 }, deps());
    if (!out.ok) throw new Error(out.error);
    const patch: StatePatch = { version: 2, baseVersion: 1, scalars: pickScalars(out.state), writes: out.writes };
    expect(applyPatch(base, patch)).toEqual(out.state);
    check(out.state, { type: 'setActiveBait', bait: 'bait-common' });
    check(out.state, { type: 'setActiveBait', bait: null });
  });
  it('redeemCoupon — 골드+사용기록', () => {
    check(seed(), { type: 'redeemCoupon', code: '출항준비' });
  });
  it('claimRelief — 합산 도감', () => {
    check(seed(), { type: 'claimRelief', code: 'x' }, {
      relief: { gold: 100, fame: 50, rod: 1, boat: 0, dex: { carp: { normal: { count: 2, maxSize: 30, first: '2026-08-20' } } } },
    });
  });
  it('boot / sendLetter — 상태불변, writes 빈값', () => {
    const s = seed({ bag: [mkInst('a')] });
    for (const action of [{ type: 'boot', buildId: 'abc' }, { type: 'sendLetter', text: 'hi' }] as const) {
      const out = applyAction(s, action, deps());
      if (!out.ok) throw new Error(out.error);
      expect(out.writes).toEqual({ instancesAdded: [], instancesRemoved: [], instancesMoved: [], instancesLocked: [], records: [] });
      check(s, action);
    }
  });
  it('adminSet — 스칼라 직접 수정', () => {
    check(seed(), { type: 'adminSet', gold: 5, fame: 6, rod: 2, boat: 1 });
  });
  it('import — 통째 교체도 델타로 표현된다', () => {
    const prev = seed({ bag: [mkInst('a')], gold: 10 });
    const save = { ...newState(), gold: 777, fame: 888 };
    check(prev, { type: 'import', save });
  });
});

describe('patch — 전시장 합성 + 내성', () => {
  it('가방↔전시 이동·잠금·부재 uid를 정확히 재조립한다', () => {
    const prev = seed({
      bag: [mkInst('a'), mkInst('b')],
      exhibit: [mkInst('c')],
    });
    const patch: StatePatch = {
      version: 2,
      baseVersion: 1,
      scalars: pickScalars(prev),
      writes: {
        instancesAdded: [{ inst: mkInst('d'), slot: null }],
        instancesRemoved: ['ghost'],
        instancesMoved: [{ uid: 'a', slot: 1 }, { uid: 'c', slot: null }],
        instancesLocked: [{ uid: 'b', locked: true }, { uid: 'ghost', locked: true }],
        records: [],
      },
    };
    const next = applyPatch(prev, patch);
    expect(next.bag.map(i => i.uid)).toEqual(['b', 'c', 'd']);
    expect(next.bag.find(i => i.uid === 'b')?.locked).toBe(true);
    expect(next.exhibit[1]?.uid).toBe('a');
    expect(next.exhibit[0]).toBeUndefined();
  });
  it('빈 델타는 같은 내용의 상태를 돌려준다', () => {
    const s = seed({ bag: [mkInst('a')] });
    const out = applyAction(s, { type: 'boot' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(applyPatch(s, { version: 9, baseVersion: 8, scalars: pickScalars(out.state), writes: out.writes })).toEqual(s);
  });
});

describe('patch — 페이로드 축소 회귀 가드', () => {
  it('2000마리 가방의 catch 델타는 풀의 1/10 미만이다', () => {
    const bag = Array.from({ length: 2000 }, (_, i) => mkInst(`b${i}`));
    const prev = seed({ bag, boat: 6 });
    const out = applyAction(prev, { type: 'catch', spot: 'pond', judgment: 'normal' }, deps());
    if (!out.ok) throw new Error(out.error);
    const full = JSON.stringify(out.state).length;
    const patch: StatePatch = { version: 2, baseVersion: 1, scalars: pickScalars(out.state), writes: out.writes };
    const delta = JSON.stringify(patch).length;
    expect(applyPatch(prev, patch)).toEqual(out.state);
    expect(delta).toBeLessThan(full / 10);
  });
});
