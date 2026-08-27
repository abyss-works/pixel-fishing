// 액션 리듀서 — 서버(api/action)와 LocalBackend가 공유하는 상태 전이 규칙 (v0.5.0)
import { describe, it, expect } from 'vitest';
import { applyAction, LETTER_MAX } from './actions';
import type { ActionDeps } from './actions';
import { BAIT_BUY_MAX } from './balance';
import { BOATS, COUPONS, FISH, newState, upgradeCost } from './logic';
import type { FishInstance, FormId, GameState } from './logic';
import { baitById } from '../data/baits';

/** items/activeBait 키 리터럴 — data/baits.ts의 고정 신분증 */
const BAIT_ID = { common: 'bait-common', rare: 'bait-rare', epic: 'bait-epic',
                  legendary: 'bait-legendary' } as const;

// newUid는 결정적 목 — 개체 uid가 매 실행 달라지면 재현성 검증이 불가능하다
const deps = (over: Partial<ActionDeps> = {}): ActionDeps => {
  let n = 0;
  return {
    rng: () => 0, today: '2026-08-22', now: '2026-08-22T03:00:00.000Z',
    newUid: () => `uid-${++n}`, ...over,
  };
};

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

const mkInst = (uid: string, fishId: string, form: FormId = 'normal', locked = false): FishInstance =>
  ({ uid, fishId, form, size: 20, caughtAt: null, spot: null, judgment: null, locked });

describe('catch', () => {
  it('추첨·기록·이벤트 — rng=0이면 풀 첫 어종 + 변이 확정 (기존 목킹 계약)', () => {
    const out = applyAction(seed(), { type: 'catch', spot: 'pond', judgment: 'normal' }, deps());
    if (!out.ok) throw new Error(out.error);
    // rng=0 → 붕어 + 변이 롤 성공. 개체에 문맥이 통째로 새겨진다 (세이브 v8)
    expect(out.state.bag).toEqual([{
      uid: 'uid-1', fishId: 'crucian', form: 'variant',
      size: expect.any(Number), caughtAt: '2026-08-22T03:00:00.000Z',
      spot: 'pond', judgment: 'normal', locked: false,
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

  it('파워 게이트 — 미달 수역의 상위 판정 주장은 강등된다 (개체·이벤트 모두 확정값)', () => {
    // deep 요구 파워 60 — Lv1(P1)은 미달. 배는 2단계(수역 자체는 열려 있다)
    const out = applyAction(seed({ boat: 2 }), { type: 'catch', spot: 'deep', judgment: 'good' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag[0].judgment).toBe('normal');
    expect(out.events[0]).toMatchObject({ type: 'catch', payload: { judgment: 'normal' } });
  });

  it('파워 게이트 — 빨간 존 없는 수역의 PERFECT 주장은 GOOD으로 강등된다', () => {
    // 마을 연못(요구 -10) Lv1: 초과 11 → 빨간 존 미개방, 노란 존은 있다
    const out = applyAction(seed(), { type: 'catch', spot: 'pond', judgment: 'perfect' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag[0].judgment).toBe('good');
  });

  it('파워 게이트 — 초과 30 이상이면 PERFECT가 살아남는다', () => {
    // 연못 10 + Lv10(P55): 초과 45 → 빨강 15 → PERFECT 유지
    const out = applyAction(seed({ rod: 10 }), { type: 'catch', spot: 'pond', judgment: 'perfect' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag[0].judgment).toBe('perfect');
    expect(out.events[0]).toMatchObject({ type: 'catch', payload: { judgment: 'perfect' } });
  });

  it('파워 게이트 — 요구 이상 수역은 PERFECT가 그대로 살아남는다', () => {
    // 연못 10 + Lv10(P55) => 초과 45 → 빨강 15 → PERFECT 유지
    const out = applyAction(seed({ rod: 10 }), { type: 'catch', spot: 'pond', judgment: 'perfect' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag[0].judgment).toBe('perfect');
    expect(out.events[0]).toMatchObject({ type: 'catch', payload: { judgment: 'perfect' } });
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

  it('catch — 가방이 가득 차면 가장 안 특별한 개체를 놓아주고 결과·이벤트·델타에 남긴다', () => {
    // rng=0 → 붕어(일반) 변이가 잡힌다. 가방은 일반 붕어로 꽉 채워 둔다 (돛단배 = boat 2)
    const cap = BOATS[1].bagCap;
    const bag = Array.from({ length: cap }, (_, i) => mkInst(`old-${i}`, 'crucian'));
    const out = applyAction(seed({ boat: 2, bag }), { type: 'catch', spot: 'pond', judgment: 'normal' }, deps());
    if (!out.ok) throw new Error(out.error);
    if (out.result.type !== 'catch') throw new Error('catch 결과가 아님');

    expect(out.state.bag).toHaveLength(cap);                // 상한을 넘지 않는다
    expect(out.result.released).toHaveLength(1);
    expect(out.state.bag.some(i => i.uid === 'uid-1')).toBe(true); // 변이는 더 특별해 남는다

    const releasedUid = out.result.released[0].uid;
    expect(releasedUid).toMatch(/^old-/);                   // 기존 일반 개체가 나간다
    expect(out.writes.instancesRemoved).toEqual([releasedUid]);
    expect(out.events.map(e => e.type)).toEqual(['catch', 'autoRelease']);
    expect(out.events[1].payload).toMatchObject({ uids: [releasedUid], reason: 'bag-full' });

    // 명성·도감은 방생해도 남는다 — 잡은 사실이 사라지는 게 아니다
    expect(out.state.fame).toBeGreaterThan(0);
    expect(out.state.dex.crucian?.variant?.count).toBe(1);
  });

  it('catch — 이미 상한을 넘겨 든 가방도 한 번에 한 마리만 나간다 (v0.4.0 이관 방어)', () => {
    // 고정 상한을 그대로 들이대면 2941마리가 첫 캐치에 골드 0원으로 증발한다.
    // 상한은 캐치 전 가방 크기로 재므로(래칫) 새로 담은 만큼만 빠진다.
    const bag = Array.from({ length: 3000 }, (_, i) =>
      ({ ...mkInst(`old-${i}`, 'crucian'), size: null }));
    const out = applyAction(seed({ bag }), { type: 'catch', spot: 'pond', judgment: 'normal' }, deps());
    if (!out.ok) throw new Error(out.error);
    if (out.result.type !== 'catch') throw new Error('catch 결과가 아님');
    expect(out.result.released).toHaveLength(1);
    expect(out.state.bag).toHaveLength(3000);
    expect(out.writes.instancesRemoved).toHaveLength(1);
  });

  it('catch — 가방을 전부 잠갔으면 방금 잡은 개체가 그 자리에서 방생된다', () => {
    // 잠금은 "이건 지키라"는 명시적 표시라 후보에서 빠진다. 그래서 유일한 후보는 새 개체다.
    // 캐치를 거부하지 않는 게 요점 — 실패 페널티를 만들지 않고, 명성·도감은 그대로 남는다.
    const cap = BOATS[1].bagCap;
    const bag = Array.from({ length: cap }, (_, i) =>
      ({ ...mkInst(`old-${i}`, 'crucian'), locked: true }));
    const out = applyAction(seed({ boat: 2, bag }), { type: 'catch', spot: 'pond', judgment: 'normal' }, deps());
    if (!out.ok) throw new Error(out.error);
    if (out.result.type !== 'catch') throw new Error('catch 결과가 아님');
    expect(out.result.released.map(r => r.uid)).toEqual(['uid-1']); // 방금 잡은 그것
    expect(out.state.bag).toHaveLength(cap);
    expect(out.state.bag.every(i => i.locked)).toBe(true);          // 잠근 것은 하나도 안 나갔다
    expect(out.state.dex.crucian?.variant?.count).toBe(1);          // 도감에는 남는다
  });

  it('sell — 잠근 개체는 uid가 와도 팔리지 않고 이벤트에도 안 남는다 (이중 방어)', () => {
    const bag = [mkInst('a', 'carp', 'normal', true), mkInst('b', 'crucian')];
    const out = applyAction(seed({ bag }), { type: 'sell', uids: ['a', 'b'] }, deps());
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

  it('sendLetter — 상태는 그대로, 이벤트만 남는다', () => {
    const out = applyAction(seed({ gold: 7 }), { type: 'sendLetter', text: '  가방 늘려주세요  ' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state).toEqual(seed({ gold: 7 }));            // 게임 상태 무변경
    expect(out.events).toEqual([{ type: 'letter', payload: { text: '가방 늘려주세요' } }]); // 앞뒤 공백 제거
    expect(out.writes.instancesAdded).toEqual([]);
  });

  it('sendLetter — 빈 글과 상한 초과는 거부', () => {
    const bad = (text: string) =>
      applyAction(seed(), { type: 'sendLetter', text }, deps());
    expect(bad('')).toEqual({ ok: false, error: 'bad-request' });
    expect(bad('   ')).toEqual({ ok: false, error: 'bad-request' });
    expect(bad('가'.repeat(LETTER_MAX + 1))).toEqual({ ok: false, error: 'bad-request' });
    expect(bad('가'.repeat(LETTER_MAX)).ok).toBe(true);       // 경계는 통과
  });

  it('travel — 위치를 남기고, 첫 방문만 이벤트로 기록한다', () => {
    const first = applyAction(seed(), { type: 'travel', to: { kind: 'region', id: 'ocean' } }, deps());
    if (!first.ok) throw new Error(first.error);
    expect(first.state.location).toEqual({ kind: 'region', id: 'ocean' });
    expect(first.state.visited).toEqual(['ocean']);
    expect(first.events).toEqual([{ type: 'visit', payload: { region: 'ocean' } }]);

    // 두 번째 방문은 이벤트를 안 남긴다 — 오갈 때마다 남기면 스트림이 이동 로그가 된다
    const again = applyAction(first.state, { type: 'travel', to: { kind: 'region', id: 'ocean' } }, deps());
    if (!again.ok) throw new Error(again.error);
    expect(again.state.visited).toEqual(['ocean']);
    expect(again.events).toEqual([]);
  });

  it('travel — 거점은 방문 목록에 넣지 않는다 (지역 단위 업적이라)', () => {
    const out = applyAction(seed(), { type: 'travel', to: { kind: 'base', id: 'harbor' } }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.location).toEqual({ kind: 'base', id: 'harbor' });
    expect(out.state.visited).toEqual([]);
  });

  it('travel — 형태가 깨진 목적지는 거부', () => {
    expect(applyAction(seed(), { type: 'travel', to: { kind: 'nowhere', id: 'x' } } as never, deps()))
      .toEqual({ ok: false, error: 'bad-request' });
  });

  it('setLocked — 이벤트 없이 개체 잠금, 델타에는 잡힌다', () => {
    const bag = [mkInst('a', 'carp'), mkInst('b', 'carp')];
    const out = applyAction(seed({ bag }), { type: 'setLocked', uids: ['a'], locked: true }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag.map(i => i.locked)).toEqual([true, false]);
    expect(out.writes.instancesLocked).toEqual([{ uid: 'a', locked: true }]);
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

// 정규화 저장(0006)의 정합성 — 리듀서가 전후 비교로 뽑는 변경분.
// 케이스마다 손으로 채우지 않으므로, 새 액션이 생겨도 여기 계약이 유지돼야 한다.
describe('writes (변경분)', () => {
  it('catch — 개체 1건 추가 + 그 종×폼 도감 1행', () => {
    const out = applyAction(seed(), { type: 'catch', spot: 'pond', judgment: 'normal' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.writes.instancesAdded).toHaveLength(1);
    expect(out.writes.instancesAdded[0].slot).toBeNull();          // 가방행
    expect(out.writes.instancesAdded[0].inst.uid).toBe('uid-1');
    expect(out.writes.instancesRemoved).toEqual([]);
    expect(out.writes.records).toHaveLength(1);
    expect(out.writes.records[0]).toMatchObject({ fishId: 'crucian', form: 'variant' });
  });

  it('sell — 판매한 개체만 제거, 도감은 안 건드린다', () => {
    const bag = [mkInst('a', 'carp'), mkInst('b', 'carp')];
    const out = applyAction(seed({ bag }), { type: 'sell', uids: ['a'] }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.writes.instancesRemoved).toEqual(['a']);
    expect(out.writes.instancesAdded).toEqual([]);
    expect(out.writes.records).toEqual([]);   // 판매는 기록을 바꾸지 않는다
  });

  it('잠긴 개체는 판매 요청이 와도 제거 목록에 안 들어간다', () => {
    const bag = [mkInst('a', 'carp', 'normal', true)];
    const out = applyAction(seed({ bag }), { type: 'sell', uids: ['a'] }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.writes.instancesRemoved).toEqual([]);
  });

  it('상태를 안 바꾸는 액션은 빈 변경분', () => {
    const out = applyAction(seed(), { type: 'setLocked', uids: [], locked: true }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.writes).toEqual({
      instancesAdded: [], instancesRemoved: [], instancesMoved: [], instancesLocked: [], records: [],
    });
  });

  it('가방 ↔ 전시 이동은 add/remove가 아니라 move다 (uid 보존)', () => {
    const inst = mkInst('x', 'carp');
    const before = seed({ bag: [inst] });
    const after = { ...before, bag: [], exhibit: [inst] };
    // 전시 액션은 아직 없으므로 diff 자체를 검증한다 — import 액션으로 상태를 갈아끼운다
    const out = applyAction(before, { type: 'import', save: after }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.writes.instancesMoved).toEqual([{ uid: 'x', slot: 0 }]);
    expect(out.writes.instancesAdded).toEqual([]);
    expect(out.writes.instancesRemoved).toEqual([]);
  });
});

describe('claimRelief — 지원 코드 (제재 소프트 랜딩, incidents/2026-08-24)', () => {
  const grant = {
    gold: 83_662, fame: 6_535, rod: 14, boat: 3,
    dex: {
      shark: { normal: { count: 7, maxSize: 269.027, first: '2026-08-21' },
               variant: { count: 1, maxSize: null, first: null } },
    },
  };

  it('deps.relief 없으면 거부 — 로컬 dev(오프라인)에선 발급 자체가 없다', () => {
    const out = applyAction(seed(), { type: 'claimRelief', code: 'X' }, deps());
    expect(out).toEqual({ ok: false, error: 'relief-invalid' });
  });

  it('자산 병합 — 골드·명성 가산, 낚싯대·배는 둘 중 큰 값, 이벤트를 남긴다', () => {
    const s = seed({ gold: 1_000, fame: 100, rod: 3, boat: 2 });
    const out = applyAction(s, { type: 'claimRelief', code: 'RELIEF-1' }, deps({ relief: grant }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(84_662);
    expect(out.state.fame).toBe(6_635);
    expect(out.state.rod).toBe(14);
    expect(out.state.boat).toBe(3);           // max(2, 3)
    expect(out.events[0]).toMatchObject({
      type: 'claimRelief', payload: { code: 'RELIEF-1' },
    });
    // 도감 기록이 그대로 얹힌다 — 개체(bag)는 아니므로 instances 변경분은 없다
    expect(out.state.dex.shark?.normal).toMatchObject({ count: 7, maxSize: 269.027, first: '2026-08-21' });
    expect(out.state.dex.shark?.variant).toMatchObject({ count: 1, maxSize: null, first: null });
    expect(out.writes.instancesAdded).toEqual([]);
    expect(out.writes.records.map(r => `${r.fishId}:${r.form}`).sort()).toEqual(['shark:normal', 'shark:variant']);
  });

  it('도감 병합 — 합산이 아니라 최대값·더 이른 첫조우일을 유지한다 (기록 정합)', () => {
    const s = seed({
      dex: {
        crucian: { normal: { count: 5, maxSize: 30, first: '2026-08-01' } },
        shark: { normal: { count: 9, maxSize: null, first: null },
                 variant: { count: 2, maxSize: 280, first: '2026-08-20' } },
      },
    });
    const out = applyAction(s, { type: 'claimRelief', code: 'R' }, deps({ relief: grant }));
    if (!out.ok) throw new Error(out.error);
    // 양쪽에 있던 폼 — 큰 count, 큰 maxSize, 이른 first
    expect(out.state.dex.shark?.normal).toMatchObject({ count: 9, maxSize: 269.027, first: '2026-08-21' });
    expect(out.state.dex.shark?.variant).toMatchObject({ count: 2, maxSize: 280, first: '2026-08-20' });
    // 지원금에 없던 폼은 보존
    expect(out.state.dex.crucian?.normal).toMatchObject({ count: 5, maxSize: 30, first: '2026-08-01' });
  });

  it('배 상한 클램프 — 지원 배가 MAX_BOAT를 넘지 않는다', () => {
    const out = applyAction(seed(), { type: 'claimRelief', code: 'R' },
      deps({ relief: { ...grant, boat: 99 } }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.boat).toBe(BOATS.length);
  });
});

describe('buyBait / setActiveBait', () => {
  const COMMON = BAIT_ID.common;
  const RARE = BAIT_ID.rare;

  it('구매 — 골드 차감 + 스택 적립 + 이벤트', () => {
    const price = baitById(COMMON)!.price;
    const out = applyAction(
      seed({ gold: price * 3, items: { [COMMON]: 1 }, location: { kind: 'base', id: 'colombo' } }),
      { type: 'buyBait', bait: COMMON, count: 3 }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(0);
    expect(out.state.items[COMMON]).toBe(4); // 기존 1 + 3
    expect(out.events[0]).toMatchObject({
      type: 'buyBait', payload: { bait: COMMON, count: 3, cost: price * 3 },
    });
  });

  it('골드 부족은 거부된다 — 규칙 거부라 상태 불변', () => {
    const out = applyAction(seed({ gold: 1, location: { kind: 'base', id: 'colombo' } }),
      { type: 'buyBait', bait: RARE }, deps());
    expect(out).toEqual({ ok: false, error: 'not-enough-gold' });
  });

  it('구매처는 콜롬보 항구로 제한된다 — 다른 위치의 직접 액션은 거부', () => {
    const out = applyAction(seed({ gold: baitById(COMMON)!.price }),
      { type: 'buyBait', bait: COMMON }, deps());
    expect(out).toEqual({ ok: false, error: 'shop-closed' });
  });

  it('모르는 미끼 id · 유효하지 않은 count는 bad-request', () => {
    expect(applyAction(seed(), { type: 'buyBait', bait: 'hax' }, deps()))
      .toEqual({ ok: false, error: 'bad-request' });
    expect(applyAction(seed({ gold: 9e9 }), { type: 'buyBait', bait: COMMON, count: 0 }, deps()))
      .toEqual({ ok: false, error: 'bad-request' });
    expect(applyAction(seed({ gold: 9e9 }), { type: 'buyBait', bait: COMMON, count: 1.5 }, deps()))
      .toEqual({ ok: false, error: 'bad-request' });
  });

  it('count 클램프 — 초대수 요청은 BUY_MAX로 접는다 (요청 1회 폭주 상한일 뿐)', () => {
    const out = applyAction(seed({ gold: 9e9, location: { kind: 'base', id: 'colombo' } }),
      { type: 'buyBait', bait: COMMON, count: 999 }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.items[COMMON]).toBe(BAIT_BUY_MAX);
    expect(out.events[0].payload).toMatchObject({ count: BAIT_BUY_MAX });
  });

  it('활성화 — 보유 없으면 거부(bait-not-owned), 있으면 설정된다. 활성화는 소모가 아니다', () => {
    const none = applyAction(seed(), { type: 'setActiveBait', bait: RARE }, deps());
    expect(none).toEqual({ ok: false, error: 'bait-not-owned' });

    const own = applyAction(seed({ items: { [RARE]: 2 } }),
      { type: 'setActiveBait', bait: RARE }, deps());
    if (!own.ok) throw new Error(own.error);
    expect(own.state.activeBait).toBe(RARE);
    expect(own.events[0]).toMatchObject({ type: 'setActiveBait', payload: { bait: RARE } });
    expect(own.state.items[RARE]).toBe(2);
  });

  it('활성은 4중 1 — 교체하면 이전 것은 끊긴다. null 비활성·멱등 재활성은 이벤트 없음', () => {
    const first = applyAction(
      seed({ items: { [COMMON]: 1, [RARE]: 1 }, activeBait: COMMON }),
      { type: 'setActiveBait', bait: RARE }, deps());
    if (!first.ok) throw new Error(first.error);
    expect(first.state.activeBait).toBe(RARE);

    const again = applyAction(first.state, { type: 'setActiveBait', bait: RARE }, deps());
    if (!again.ok) throw new Error(again.error);
    expect(again.events).toEqual([]); // 멱등

    const off = applyAction(again.state, { type: 'setActiveBait', bait: null }, deps());
    if (!off.ok) throw new Error(off.error);
    expect(off.state.activeBait).toBeNull();
    expect(off.events).toEqual([]);

    const offTwice = applyAction(off.state, { type: 'setActiveBait', bait: null }, deps());
    if (!offTwice.ok) throw new Error(offTwice.error);
    expect(offTwice.state).toBe(off.state); // 이미 null → 같은 참조 반환
  });
});

describe('catch × 미끼 (낚아올리는 순간 소모)', () => {
  const COMMON = BAIT_ID.common;

  it('수동 캐치는 활성 미끼를 정확히 1개 소모하고 이벤트에 남긴다', () => {
    const s = seed({ items: { [COMMON]: 3 }, activeBait: COMMON });
    const out = applyAction(s, { type: 'catch', spot: 'pond', judgment: 'normal' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.items[COMMON]).toBe(2);
    expect(out.events[0].payload).toMatchObject({ fishId: 'crucian', bait: COMMON });
  });

  it('방치(auto)는 소모도 효과도 없다 — 미끼 판단은 낚아올리는 순간 확정', () => {
    const s = seed({ items: { [COMMON]: 3 }, activeBait: COMMON });
    const out = applyAction(s, { type: 'catch', spot: 'pond', judgment: 'auto' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.items[COMMON]).toBe(3);
    expect('bait' in out.events[0].payload).toBe(false);
  });

  it('보유 0인 활성은 합법 상태 — 소모 없이 무음으로 통과한다(자동 해제 안 함)', () => {
    const s = seed({ items: {}, activeBait: COMMON });
    const out = applyAction(s, { type: 'catch', spot: 'pond', judgment: 'perfect' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.items[COMMON]).toBeUndefined();
    expect(out.state.activeBait).toBe(COMMON); // 유지 — 보충하면 그대로 재개
    expect('bait' in out.events[0].payload).toBe(false);
  });
});
