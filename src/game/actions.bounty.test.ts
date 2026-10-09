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
// 태평양 전설 포함 전부 (일반 폼만) — 희귀 3·영웅 3·전설 4 추가
const pacificFullDex = {
  ...pacificDex,
  seabream: { normal: rec(1) }, yellowtail: { normal: rec(1) }, squid: { normal: rec(1) },
  tuna: { normal: rec(1) }, coelacanth: { normal: rec(1) }, oarfish: { normal: rec(1) },
  shark: { normal: rec(1) }, kraken: { normal: rec(1) },
  moonveil: { normal: rec(1) }, abyssveil: { normal: rec(1) },
};
// 서버 주입 — 오늘 0회·완료 없음이 기본값 (라이선스 조건은 상태에서 직접 본다)
const ctx = (over = {}) => ({ acceptsToday: 0, namedToday: 0, tickets: [] as { questId: string; issuedAt: string }[], complete: [] as string[], active: [] as string[], ...over });

describe('acceptQuest', () => {
  // 수주 조건은 상태에서 직접 본다 — 도감 완성 태평양 + 명성 1500이 기본값
  const ready = { ...harbor, fame: 1500, dex: pacificDex };

  it('없는 의뢰는 bad-request', () => {
    const out = applyAction(seed({ ...ready }), { type: 'acceptQuest', questId: 'nope', port: 'harbor' }, deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'bad-request' });
  });

  it('명성 미달이면 not-enough-fame', () => {
    const out = applyAction(seed({ ...harbor, fame: 100, dex: pacificDex }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'not-enough-fame' });
  });

  it('도감 미완이면 dex-incomplete', () => {
    const out = applyAction(seed({ ...harbor, fame: 1500 }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'dex-incomplete' });
  });

  it('통합 상한 초과는 no-tickets', () => {
    const out = applyAction(seed({ ...ready }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx({ acceptsToday: 3 }) }));
    expect(out).toEqual({ ok: false, error: 'no-tickets' });
  });

  it('네임드는 전역 1회 — 오늘 이미 수주했으면 no-tickets', () => {
    const act = { type: 'acceptQuest', questId: 'pacific-named-megalodon', port: 'harbor' } as const;
    const full = seed({ ...harbor, fame: 1500, dex: pacificFullDex });
    expect(applyAction(full, act, deps({ bounty: ctx({ namedToday: 1 }) })))
      .toEqual({ ok: false, error: 'no-tickets' });
  });

  it('네임드는 일반 상한을 먹지 않는다', () => {
    const act = { type: 'acceptQuest', questId: 'pacific-named-megalodon', port: 'harbor' } as const;
    const out = applyAction(seed({ ...harbor, fame: 1500, dex: pacificFullDex }), act,
      deps({ bounty: ctx({ acceptsToday: 3 }) }));
    if (!out.ok) throw new Error(out.error);
    expect(out.events).toEqual([{ type: 'acceptQuest',
      payload: { questId: 'pacific-named-megalodon', port: 'harbor' } }]);
  });

  it('고향 수주는 bad-request — 고향에 수배 창구가 없다', () => {
    const out = applyAction(seed({ location: { kind: 'base', id: 'home' } }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'home' },
      deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'bad-request' });
  });

  it('주장 항구와 실제 위치가 다르면 bad-request', () => {
    const out = applyAction(seed({ ...ready }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'manila' },
      deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'bad-request' });
  });

  it('진행 중 의뢰의 중복 수주는 quest-active', () => {
    const out = applyAction(seed({ ...ready }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx({ active: ['pacific-easy-common'] }) }));
    expect(out).toEqual({ ok: false, error: 'quest-active' });
  });

  it('네임드 의뢰는 전설 포함 도감이 있어야 한다', () => {
    const act = { type: 'acceptQuest', questId: 'pacific-named-megalodon', port: 'harbor' } as const;
    expect(applyAction(seed({ ...ready }), act, deps({ bounty: ctx() })))
      .toEqual({ ok: false, error: 'dex-incomplete' });
    const out = applyAction(seed({ ...harbor, fame: 1500, dex: pacificFullDex }), act,
      deps({ bounty: ctx() }));
    if (!out.ok) throw new Error(out.error);
    expect(out.events).toEqual([{ type: 'acceptQuest',
      payload: { questId: 'pacific-named-megalodon', port: 'harbor' } }]);
  });

  it('통과하면 상태 불변 + 감사 이벤트만 남긴다', () => {
    const st = seed({ ...ready });
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
    expect(out.state.gold).toBe(4100); // 100 + 보상 4000
    expect(out.events).toEqual([{ type: 'deliverBounty',
      payload: { questId: 'pacific-easy-common', reward: 4000 } }]);
  });

  it('네임드 납품에는 교환 재료 1개가 따라온다', () => {
    const out = applyAction(seed({ gold: 0 }),
      { type: 'deliverBounty', questId: 'pacific-named-megalodon' },
      deps({ bounty: ctx({ complete: ['pacific-named-megalodon'] }) }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(40000);
    expect(out.state.items['mat-abyss-lantern']).toBe(1);
  });
});

describe('exchangeArtifact', () => {
  const act = { type: 'exchangeArtifact', artifact: 'abyss-angler' } as const;

  it('없는 유물은 bad-request', () => {
    const out = applyAction(seed(), { type: 'exchangeArtifact', artifact: 'nope' }, deps());
    expect(out).toEqual({ ok: false, error: 'bad-request' });
  });

  it('재료 없으면 material-missing', () => {
    const out = applyAction(seed(), act, deps());
    expect(out).toEqual({ ok: false, error: 'material-missing' });
  });

  it('재료 1개를 유물 1개로 바꾼다', () => {
    const out = applyAction(seed({ items: { 'mat-abyss-lantern': 1 } }), act, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.artifacts).toEqual(['abyss-angler']);
    expect(out.state.items['mat-abyss-lantern']).toBeUndefined(); // 0은 행을 접는다
    expect(out.events).toEqual([{ type: 'exchangeArtifact', payload: { artifact: 'abyss-angler' } }]);
  });

  it('이미 가진 유물은 멱등 수용 — 상태 그대로·이벤트 없음', () => {
    const st = seed({ items: { 'mat-abyss-lantern': 1 }, artifacts: ['abyss-angler'] });
    const out = applyAction(st, act, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state).toEqual(st);
    expect(out.events).toEqual([]);
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

describe('named ticket', () => {
  // 수주 중 네임드 + 게이트 명중(rng 0) → 통상 캐치는 그대로 하고 도전권 이벤트만 덧붙인다
  // (sea 수역이라 배 1 필요 — 게이트는 canFish 뒤에 돈다)
  const hitDeps = () => deps({ bounty: ctx({ active: ['pacific-named-megalodon'] }), rng: () => 0 });
  const sea = seed({ boat: 1 });

  it('게이트 명중이면 통상 획득 + ticket 이벤트·결과를 남긴다', () => {
    const out = applyAction(sea, { type: 'catch', spot: 'sea', judgment: 'normal' }, hitDeps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag).toHaveLength(1); // 통상 캐치 그대로
    expect(out.events).toContainEqual({ type: 'ticket', payload: { questId: 'pacific-named-megalodon' } });
    expect(out.result).toMatchObject({ type: 'catch', ticket: 'pacific-named-megalodon' });
  });

  it('게이트 빗나감(rng 1)은 ticket 없이 통상 캐치 그대로다', () => {
    const out = applyAction(seed(),
      { type: 'catch', spot: 'pond', judgment: 'normal' },
      deps({ bounty: ctx({ active: ['pacific-named-megalodon'] }), rng: () => 0.999 }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag).toHaveLength(1); // pond 붕어
    expect(out.events.some(e => e.type === 'ticket')).toBe(false);
    expect(out.result).toMatchObject({ type: 'catch' });
    expect('ticket' in (out.result as object)).toBe(false);
  });

  it('수주 중이 아니면 게이트가 돌지 않는다', () => {
    const out = applyAction(sea, { type: 'catch', spot: 'sea', judgment: 'normal' }, deps({ rng: () => 0 }));
    if (!out.ok) throw new Error(out.error);
    expect(out.events.some(e => e.type === 'ticket')).toBe(false);
  });
});

describe('resolveChallenge', () => {
  const act = (over = {}) => ({
    type: 'resolveChallenge', questId: 'pacific-named-megalodon',
    success: true, hits: 7, misses: 0, ...over,
  } as const);
  const ticket = (issuedAt: string) => [{ questId: 'pacific-named-megalodon', issuedAt }];
  const NOW = '2026-10-09T01:00:00.000Z';
  const ready = () => seed({ dex: {} });
  const dyn = { today: '2026-10-09', now: NOW, rng: () => 0, newUid: () => 'uid-1' };
  const full = (over: Partial<ActionDeps> = {}) => deps({
    ...dyn,
    bounty: ctx({ active: ['pacific-named-megalodon'], tickets: ticket('2026-10-09T00:30:00.000Z') }),
    ...over,
  });

  it('형태가 깨지면 bad-request', () => {
    expect(applyAction(seed(), { type: 'resolveChallenge', questId: 42 } as never, deps()))
      .toEqual({ ok: false, error: 'bad-request' });
  });

  it('수주 중이 아니면 bad-request', () => {
    expect(applyAction(ready(), act(), deps({ ...dyn, bounty: ctx() })))
      .toEqual({ ok: false, error: 'bad-request' });
  });

  it('도전권 없으면 ticket-missing', () => {
    expect(applyAction(ready(), act(), deps({ ...dyn, bounty: ctx({ active: ['pacific-named-megalodon'] }) })))
      .toEqual({ ok: false, error: 'ticket-missing' });
  });

  it('만료됐으면 ticket-expired', () => {
    const out = applyAction(ready(), act(), deps({ ...dyn,
      bounty: ctx({ active: ['pacific-named-megalodon'], tickets: ticket('2026-10-08T00:00:00.000Z') }) }));
    expect(out).toEqual({ ok: false, error: 'ticket-expired' });
  });

  it('주장 정합성이 깨지면 bad-request (7히트 미만 성공 주장)', () => {
    expect(applyAction(ready(), act({ hits: 5 }), full()))
      .toEqual({ ok: false, error: 'bad-request' });
  });

  it('성공하면 도감에 오르고 감사 이벤트를 남긴다', () => {
    const out = applyAction(ready(), act(), full());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.dex.megalodon?.normal?.count).toBe(1);
    expect(out.events).toEqual([{ type: 'resolveChallenge',
      payload: { questId: 'pacific-named-megalodon', success: true, hits: 7, misses: 0 } }]);
  });

  it('실패는 감사 이벤트만 남기고 상태가 그대로다', () => {
    const st = ready();
    const out = applyAction(st,
      act({ success: false, hits: 6, misses: 4 }), full());
    if (!out.ok) throw new Error(out.error);
    expect(out.state).toEqual(st);
    expect(out.events).toEqual([{ type: 'resolveChallenge',
      payload: { questId: 'pacific-named-megalodon', success: false, hits: 6, misses: 4 } }]);
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
