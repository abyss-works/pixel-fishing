// 액션 리듀서 — 서버(api/action)와 LocalBackend가 공유하는 상태 전이 규칙 (v0.5.0)
import { describe, it, expect } from 'vitest';
import { applyAction } from './actions';
import type { ActionDeps } from './actions';
import { BOATS, COUPONS, FISH, newState, upgradeCost } from './logic';
import type { FishInstance, FormId, GameState } from './logic';

// newUid는 결정적 목 — 개체 uid가 매 실행 달라지면 재현성 검증이 불가능하다
const deps = (over: Partial<ActionDeps> = {}): ActionDeps => {
  let n = 0;
  return {
    rng: () => 0, today: '2026-08-22', now: '2026-08-22T03:00:00.000Z',
    newUid: () => `uid-${++n}`, ...over,
  };
};

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

const mkInst = (uid: string, fishId: string, form: FormId = 'normal'): FishInstance =>
  ({ uid, fishId, form, size: 20, caughtAt: null, spot: null, judgment: null });

describe('catch', () => {
  it('추첨·기록·이벤트 — rng=0이면 풀 첫 어종 + 변이 확정 (기존 목킹 계약)', () => {
    const out = applyAction(seed(), { type: 'catch', spot: 'pond', judgment: 'normal' }, deps());
    if (!out.ok) throw new Error(out.error);
    // rng=0 → 붕어 + 변이 롤 성공. 개체에 문맥이 통째로 새겨진다 (세이브 v8)
    expect(out.state.bag).toEqual([{
      uid: 'uid-1', fishId: 'crucian', form: 'variant',
      size: expect.any(Number), caughtAt: '2026-08-22T03:00:00.000Z',
      spot: 'pond', judgment: 'normal',
    }]);
    expect(out.state.dex.crucian.variant).toMatchObject({ count: 1, first: '2026-08-22' });
    expect(out.state.dex.crucian.normal).toBeUndefined(); // 폼별 기록 — 일반은 아직
    expect(out.result).toMatchObject({ type: 'catch', fishId: 'crucian', uid: 'uid-1' });
    if (out.result.type === 'catch') expect(out.result.info.isNew).toBe(true);
    // uid를 남긴다 — 이벤트와 가방 개체를 잇는 연결고리
    expect(out.events[0]).toMatchObject({
      type: 'catch', payload: { uid: 'uid-1', fishId: 'crucian', judgment: 'normal', form: 'variant' },
    });
  });

  it('배 게이트를 서버가 재검증한다 (R5b)', () => {
    const out = applyAction(seed({ boat: 0 }), { type: 'catch', spot: 'sea', judgment: 'auto' }, deps());
    expect(out).toEqual({ ok: false, error: 'spot-locked' });
  });

  it('NEW 판정은 폼별 — 일반을 잡았어도 변이 첫 캐치는 신규 (v0.3.3)', () => {
    const s = seed({ dex: { crucian: { normal: { count: 3, maxSize: null, first: null } } } });
    const out = applyAction(s, { type: 'catch', spot: 'pond', judgment: 'normal' }, deps());
    if (!out.ok || out.result.type !== 'catch') throw new Error('unexpected');
    expect(out.result.info.form).toBe('variant'); // rng=0 → 변이
    expect(out.result.info.isNew).toBe(true);     // 변이 폼은 처음
  });
});

describe('sell / upgradeRod / buyBoat / toggleLock', () => {
  it('sell — uid로 개체를 지목한다, 지목 안 된 개체는 가방에 남는다 (v8)', () => {
    const bag = [mkInst('a', 'carp'), mkInst('b', 'carp')];
    const out = applyAction(seed({ bag }), { type: 'sell', uids: ['a'] }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(30);              // 한 마리만
    expect(out.state.bag.map(i => i.uid)).toEqual(['b']);
    expect(out.result).toEqual({ type: 'sell', gold: 30 });
    expect(out.events[0]).toMatchObject({ type: 'sell', payload: { gold: 30, uids: ['a'] } });
  });

  it('sell — 잠근 어종은 uid가 와도 팔리지 않고 이벤트에도 안 남는다 (이중 방어)', () => {
    const bag = [mkInst('a', 'carp'), mkInst('b', 'crucian')];
    const out = applyAction(seed({ bag, locked: ['carp'] }), { type: 'sell', uids: ['a', 'b'] }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(6);               // 붕어만
    expect(out.state.bag.map(i => i.uid)).toEqual(['a']);
    expect(out.events[0]).toMatchObject({ payload: { uids: ['b'] } });
  });

  it('upgradeRod — 골드 부족이면 거부', () => {
    expect(applyAction(seed({ gold: upgradeCost(1) - 1 }), { type: 'upgradeRod' }, deps()))
      .toEqual({ ok: false, error: 'not-enough-gold' });
    const out = applyAction(seed({ gold: upgradeCost(1) }), { type: 'upgradeRod' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.rod).toBe(2);
  });

  it('buyBoat — 명성 하한 검증 포함', () => {
    expect(applyAction(seed({ boat: 1, gold: BOATS[1].price, fame: BOATS[1].fameReq - 1 }),
      { type: 'buyBoat' }, deps())).toEqual({ ok: false, error: 'not-enough-fame' });
    // dev4: 사유가 뭉개지지 않는다 — 골드 부족과 명성 부족이 구분된다
    expect(applyAction(seed({ boat: 1, gold: 0, fame: BOATS[1].fameReq }),
      { type: 'buyBoat' }, deps())).toEqual({ ok: false, error: 'not-enough-gold' });
    const out = applyAction(seed({ gold: BOATS[0].price }), { type: 'buyBoat' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.boat).toBe(1);
  });

  it('toggleLock — 이벤트 없이 잠금 토글', () => {
    const out = applyAction(seed(), { type: 'toggleLock', fishId: 'carp' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.locked).toEqual(['carp']);
    expect(out.events).toEqual([]);
  });
});

describe('redeemCoupon', () => {
  const staticCode = Object.keys(COUPONS)[0];

  it('정적 쿠폰 — 지급 + 재사용 거부', () => {
    const out = applyAction(seed(), { type: 'redeemCoupon', code: ` ${staticCode} ` }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(COUPONS[staticCode].gold);
    const again = applyAction(out.state, { type: 'redeemCoupon', code: staticCode }, deps());
    expect(again).toEqual({ ok: false, error: 'coupon-used' });
  });

  it('동적 쿠폰 — 주입되면 지급, 없으면 invalid', () => {
    const dyn = { gold: 77, desc: '이벤트' };
    const out = applyAction(seed(), { type: 'redeemCoupon', code: '이벤트코드' },
      deps({ dynamicCoupon: dyn }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(77);
    expect(applyAction(seed(), { type: 'redeemCoupon', code: '이벤트코드' }, deps()))
      .toEqual({ ok: false, error: 'coupon-invalid' });
  });
});

describe('import', () => {
  it('구버전 세이브를 마이그레이션해 통째로 수입 + 흔적 이벤트', () => {
    const out = applyAction(seed({ gold: 999 }),
      { type: 'import', save: { gold: 500, xp: 200, rod: 4, caught: { tuna: 2 } } }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(500);          // 기존 상태를 덮는다
    expect(out.state.rod).toBe(4);
    expect(out.state.v).toBe(8);               // 마이그레이션 체인 통과
    expect(out.state.fame).toBeGreaterThan(0); // v3→v4 명성 소급
    expect(out.events[0].type).toBe('import');
  });
});

describe('무결성', () => {
  it('rng 소비 순서가 구 클라이언트(Field)와 동일 — 추첨 → 크기 → 변이', () => {
    // 같은 rng 시퀀스로 두 번 실행하면 같은 결과 (재현성 = 서버/로컬 동등성의 기반)
    const mkRng = () => { const seq = [0.5, 0.3, 0.1]; let i = 0; return () => seq[i++ % seq.length]; };
    const a = applyAction(seed(), { type: 'catch', spot: 'pond', judgment: 'perfect' }, deps({ rng: mkRng() }));
    const b = applyAction(seed(), { type: 'catch', spot: 'pond', judgment: 'perfect' }, deps({ rng: mkRng() }));
    if (!a.ok || !b.ok) throw new Error('unexpected');
    // uid만 다르고 추첨 결과(종·폼·크기)는 동일해야 한다
    const strip = (s: typeof a) => s.ok ? s.state.bag.map(({ uid: _uid, ...rest }) => rest) : null;
    expect(strip(a)).toEqual(strip(b));
    expect(FISH.some(f => f.id === a.state.bag[0].fishId)).toBe(true);
  });

  it('알 수 없는 액션은 거부', () => {
    const out = applyAction(seed(), { type: 'hack' } as never, deps());
    expect(out).toEqual({ ok: false, error: 'bad-request' });
  });
});
