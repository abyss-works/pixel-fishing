// 현상금 액션 — 수배 라이선스·수주·납품의 상태 전이 규칙.
// DB 진실(라이선스 소유·일일 카운트·진행도)은 서버가 deps.bounty로 주입한다
// (deps.relief 선례). 로컬 dev엔 주입이 없어 수주·납품이 닫혀 있다.
import { describe, it, expect } from 'vitest';
import { applyAction } from './actions';
import type { ActionDeps } from './actions';
import { newState } from './logic';
import type { GameState } from './logic';
import { matchBountyCatch, rollNamedEncounter } from './logic';
import { BOUNTIES } from '../data/bounties';

const deps = (over: Partial<ActionDeps> = {}): ActionDeps => {
  let n = 0;
  return {
    rng: () => 0, today: '2026-08-22', now: '2026-08-22T03:00:00.000Z',
    newUid: () => `uid-${++n}`, ...over,
  };
};

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const harbor = { location: { kind: 'base', id: 'harbor' } } as const;
const rec = (count: number) => ({ count, maxSize: null, first: null });
// 태평양 일반 3종 완성 도감 (고등어·갈치·아귀)
const pacificDex = { mackerel: { normal: rec(1) }, hairtail: { normal: rec(1) }, anglerfish: { normal: rec(1) } };
// 서버 주입 — 기본 라이선스 보유·오늘 0회·완료 없음이 기본값
const ctx = (over = {}) => ({ licensed: [{ zone: 'pacific', tier: 'basic' }], acceptsToday: 0, acceptsAtPortToday: 0, complete: [] as string[], active: [] as string[], ...over });

describe('acceptBountyLicense', () => {
  it('명성 미달이면 not-enough-fame — 소모 없이 검증만 한다', () => {
    const out = applyAction(seed({ fame: 1499, dex: pacificDex }),
      { type: 'acceptBountyLicense', zone: 'pacific', tier: 'basic' }, deps());
    expect(out).toEqual({ ok: false, error: 'not-enough-fame' });
  });

  it('도감 미완이면 dex-incomplete', () => {
    const out = applyAction(seed({ fame: 1500 }),
      { type: 'acceptBountyLicense', zone: 'pacific', tier: 'basic' }, deps());
    expect(out).toEqual({ ok: false, error: 'dex-incomplete' });
  });

  it('통과하면 상태 불변 + 감사 이벤트만 남긴다 (행 기록은 서버가 DB에)', () => {
    const st = seed({ fame: 1500, dex: pacificDex });
    const out = applyAction(st,
      { type: 'acceptBountyLicense', zone: 'pacific', tier: 'basic' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state).toEqual(st);
    expect(out.events).toEqual([{ type: 'acceptBountyLicense',
      payload: { zone: 'pacific', tier: 'basic' } }]);
  });

  it('없는 해역·tier는 bad-request', () => {
    const st = seed({ fame: 999999, dex: pacificDex });
    expect(applyAction(st,
      { type: 'acceptBountyLicense', zone: 'atlantis', tier: 'basic' }, deps()))
      .toEqual({ ok: false, error: 'bad-request' });
    expect(applyAction(st,
      { type: 'acceptBountyLicense', zone: 'pacific', tier: 'abyss' }, deps()))
      .toEqual({ ok: false, error: 'bad-request' });
  });
});

describe('acceptQuest', () => {
  it('없는 의뢰는 bad-request', () => {
    const out = applyAction(seed({ ...harbor }), { type: 'acceptQuest', questId: 'nope', port: 'harbor' }, deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'bad-request' });
  });

  it('라이선스 미보유는 no-license', () => {
    const out = applyAction(seed({ ...harbor }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx({ licensed: [] }) }));
    expect(out).toEqual({ ok: false, error: 'no-license' });
  });

  it('통합 상한 초과는 no-tickets', () => {
    const out = applyAction(seed({ ...harbor }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx({ acceptsToday: 3 }) }));
    expect(out).toEqual({ ok: false, error: 'no-tickets' });
  });

  it('항구 상한 초과는 port-limit', () => {
    const out = applyAction(seed({ ...harbor }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx({ acceptsAtPortToday: 1 }) }));
    expect(out).toEqual({ ok: false, error: 'port-limit' });
  });

  it('고향 수주는 bad-request — 고향에 수배 창구가 없다', () => {
    const out = applyAction(seed({ location: { kind: 'base', id: 'home' } }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'home' },
      deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'bad-request' });
  });

  it('주장 항구와 실제 위치가 다르면 bad-request', () => {
    const out = applyAction(seed({ ...harbor }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'manila' },
      deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'bad-request' });
  });

  it('진행 중 의뢰의 중복 수주는 quest-active', () => {
    const out = applyAction(seed({ ...harbor }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx({ active: ['pacific-easy-common'] }) }));
    expect(out).toEqual({ ok: false, error: 'quest-active' });
  });

  it('네임드 의뢰는 네임드 라이선스가 있어야 한다', () => {
    const base = seed({ ...harbor });
    const act = { type: 'acceptQuest', questId: 'pacific-named-megalodon', port: 'harbor' } as const;
    expect(applyAction(base, act, deps({ bounty: ctx() })))
      .toEqual({ ok: false, error: 'no-license' });
    const out = applyAction(base, act,
      deps({ bounty: ctx({ licensed: [{ zone: 'pacific', tier: 'named' }] }) }));
    if (!out.ok) throw new Error(out.error);
    expect(out.events).toEqual([{ type: 'acceptQuest',
      payload: { questId: 'pacific-named-megalodon', port: 'harbor' } }]);
  });

  it('네임드 라이선스는 기본 의뢰도 연다', () => {
    const out = applyAction(seed({ ...harbor }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx({ licensed: [{ zone: 'pacific', tier: 'named' }] }) }));
    expect(out.ok).toBe(true);
  });

  it('통과하면 상태 불변 + 감사 이벤트만 남긴다', () => {
    const st = seed({ ...harbor });
    const out = applyAction(st,
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx() }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state).toEqual(st);
    expect(out.events).toEqual([{ type: 'acceptQuest',
      payload: { questId: 'pacific-easy-common', port: 'harbor' } }]);
  });
});

describe('deliverBounty', () => {
  it('미완료 납품은 quest-incomplete', () => {
    const out = applyAction(seed(), { type: 'deliverBounty', questId: 'pacific-easy-common' }, deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'quest-incomplete' });
  });

  it('완료 납품은 보상 골드만 더하고 이벤트를 남긴다', () => {
    const out = applyAction(seed({ gold: 100 }),
      { type: 'deliverBounty', questId: 'pacific-easy-common' },
      deps({ bounty: ctx({ complete: ['pacific-easy-common'] }) }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(600); // 100 + 보상 500
    expect(out.events).toEqual([{ type: 'deliverBounty',
      payload: { questId: 'pacific-easy-common', reward: 500 } }]);
  });
});

describe('rollNamedEncounter', () => {
  it('수주 중 네임드가 없으면 null — rng를 소모하지 않는다', () => {
    let calls = 0;
    expect(rollNamedEncounter([], 'sea', () => { calls++; return 0; })).toBeNull();
    expect(calls).toBe(0);
  });

  it('해역이 다르면 null', () => {
    expect(rollNamedEncounter(['pacific-named-megalodon'], 'dragonhole', () => 0)).toBeNull();
  });

  it('게이트 확률(1/2000) 밖이면 null', () => {
    expect(rollNamedEncounter(['pacific-named-megalodon'], 'sea', () => 0.999)).toBeNull();
  });

  it('게이트 명중이면 그 해역 의뢰를 돌려준다', () => {
    const q = rollNamedEncounter(['pacific-named-megalodon'], 'sea', () => 0);
    expect(q?.id).toBe('pacific-named-megalodon');
  });
});

describe('named catch', () => {
  // 수주 중 네임드 + 게이트 명중(rng 0) → 개체 없이 진행도·도감만 오른다
  // (sea 수역이라 배 1 필요 — 게이트는 canFish 뒤에 돈다)
  const hitDeps = () => deps({ bounty: ctx({ active: ['pacific-named-megalodon'] }), rng: () => 0 });
  const sea = seed({ boat: 1 });

  it('가방에 개체를 넣지 않고 도감 기록만 남긴다', () => {
    const out = applyAction(sea, { type: 'catch', spot: 'sea', judgment: 'normal' }, hitDeps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag).toEqual([]);
    expect(out.state.dex.megalodon?.normal?.count).toBe(1);
    expect(out.result).toMatchObject({ type: 'catch', fishId: 'megalodon' });
    expect(out.events[0]).toMatchObject({
      type: 'catch', payload: { fishId: 'megalodon', named: 'pacific-named-megalodon' },
    });
  });

  it('명성·골드는 그대로다 (보상은 납품 때)', () => {
    const out = applyAction(sea, { type: 'catch', spot: 'sea', judgment: 'normal' }, hitDeps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.fame).toBe(0);
    expect(out.state.gold).toBe(0);
  });

  it('게이트 빗나감(rng 1)은 통상 캐치 그대로다', () => {
    const out = applyAction(seed(),
      { type: 'catch', spot: 'pond', judgment: 'normal' },
      deps({ bounty: ctx({ active: ['pacific-named-megalodon'] }), rng: () => 0.999 }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag).toHaveLength(1); // pond 붕어
    expect(out.state.dex.megalodon).toBeUndefined();
  });
});

describe('matchBountyCatch', () => {
  const easy = BOUNTIES.find(q => q.id === 'pacific-easy-common')!;
  const named = BOUNTIES.find(q => q.id === 'pacific-named-megalodon')!;

  it('해역·등급이 맞으면 진행된다', () => {
    expect(matchBountyCatch(easy, 'sea', 'mackerel')).toBe(true); // 태평양 일반
    expect(matchBountyCatch(easy, 'deep', 'anglerfish')).toBe(true); // 해구도 태평양 해역
    expect(matchBountyCatch(easy, 'sea', 'seabream')).toBe(false); // 희귀는 일반 의뢰에 무효
    expect(matchBountyCatch(easy, 'pond', 'crucian')).toBe(false); // 마을은 태평양 해역이 아니다
  });

  it('해역이 다르면 진행되지 않는다', () => {
    // dragonhole 수역 어종이어도 태평양 의뢰에는 무효다
    expect(matchBountyCatch(easy, 'dragonhole', 'sailfish')).toBe(false);
  });

  it('네임드는 대상 어종 1종만 진행시킨다', () => {
    expect(matchBountyCatch(named, 'sea', 'megalodon')).toBe(true);
    expect(matchBountyCatch(named, 'sea', 'shark')).toBe(false);
  });
});
