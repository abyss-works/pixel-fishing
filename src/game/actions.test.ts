// 액션 리듀서 — 서버(api/action)와 LocalBackend가 공유하는 상태 전이 규칙 (v0.5.0)
import { describe, it, expect } from 'vitest';
import { applyAction } from './actions';
import type { ActionDeps } from './actions';
import { BOATS, COUPONS, FISH, newState, upgradeCost } from './logic';
import type { GameState } from './logic';

const deps = (over: Partial<ActionDeps> = {}): ActionDeps =>
  ({ rng: () => 0, today: '2026-08-22', ...over });

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

describe('catch', () => {
  it('추첨·기록·이벤트 — rng=0이면 풀 첫 어종 + 변이 확정 (기존 목킹 계약)', () => {
    const out = applyAction(seed(), { type: 'catch', spot: 'pond', judgment: 'normal' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag).toEqual(['crucian*']); // rng=0 → 붕어 + 변이 롤 성공
    expect(out.state.caught.crucian).toBe(1);
    expect(out.result).toMatchObject({ type: 'catch', fishId: 'crucian' });
    if (out.result.type === 'catch') expect(out.result.info.isNew).toBe(true);
    expect(out.events[0]).toMatchObject({ type: 'catch', payload: { fishId: 'crucian', judgment: 'normal' } });
  });

  it('배 게이트를 서버가 재검증한다 (R5b)', () => {
    const out = applyAction(seed({ boat: 0 }), { type: 'catch', spot: 'sea', judgment: 'auto' }, deps());
    expect(out).toEqual({ ok: false, error: 'spot-locked' });
  });

  it('NEW 판정은 폼별 — 일반을 잡았어도 변이 첫 캐치는 신규 (v0.3.3)', () => {
    const s = seed({ caught: { crucian: 3 } }); // 일반만 3마리
    const out = applyAction(s, { type: 'catch', spot: 'pond', judgment: 'normal' }, deps());
    if (!out.ok || out.result.type !== 'catch') throw new Error('unexpected');
    expect(out.result.info.mutated).toBe(true); // rng=0 → 변이
    expect(out.result.info.isNew).toBe(true);   // 변이 폼은 처음
  });
});

describe('sell / upgradeRod / buyBoat / toggleLock', () => {
  it('sell — 골드 지급 + 이벤트, 결과에 판매액', () => {
    const out = applyAction(seed({ bag: ['carp', 'carp'] }), { type: 'sell', entries: ['carp'] }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(60);
    expect(out.state.bag).toEqual([]);
    expect(out.result).toEqual({ type: 'sell', gold: 60 });
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
      { type: 'buyBoat' }, deps())).toEqual({ ok: false, error: 'boat-requirements' });
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
    expect(again).toEqual({ ok: false, error: 'coupon:used' });
  });

  it('동적 쿠폰 — 주입되면 지급, 없으면 invalid', () => {
    const dyn = { gold: 77, desc: '이벤트' };
    const out = applyAction(seed(), { type: 'redeemCoupon', code: '이벤트코드' },
      deps({ dynamicCoupon: dyn }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(77);
    expect(applyAction(seed(), { type: 'redeemCoupon', code: '이벤트코드' }, deps()))
      .toEqual({ ok: false, error: 'coupon:invalid' });
  });
});

describe('import', () => {
  it('구버전 세이브를 마이그레이션해 통째로 수입 + 흔적 이벤트', () => {
    const out = applyAction(seed({ gold: 999 }),
      { type: 'import', save: { gold: 500, xp: 200, rod: 4, caught: { tuna: 2 } } }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(500);          // 기존 상태를 덮는다
    expect(out.state.rod).toBe(4);
    expect(out.state.v).toBe(7);               // 마이그레이션 체인 통과
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
    expect(a.state.bag).toEqual(b.state.bag);
    expect(FISH.some(f => f.id === a.state.bag[0].replace('*', ''))).toBe(true);
  });

  it('알 수 없는 액션은 거부', () => {
    const out = applyAction(seed(), { type: 'hack' } as never, deps());
    expect(out).toEqual({ ok: false, error: 'unknown-action' });
  });
});
