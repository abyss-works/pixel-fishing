// 바운티 헌팅 액션 — 라이선스·수주·납품·토벌의 상태 전이 규칙.
// DB 진실(오늘 클리어 횟수·수주 중 의뢰·진행도)은 서버가 deps.bounty로 주입한다
// (deps.relief 선례). 로컬 dev엔 주입이 없어 수주·납품이 닫혀 있다.
import { describe, it, expect } from 'vitest';
import { applyAction } from './actions';
import type { ActionDeps } from './actions';
import { newState } from './logic';
import type { GameState } from './logic';
import { matchBountyCatch, rollNamedEncounter } from './logic';
import type { BountyCtx } from './rules';
import { BOUNTIES } from '../content/bounties';

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
// 태평양 일반 등급 3종만 (고등어·갈치·아귀) — 기본 라이선스에는 모자란다
const pacificCommonDex = { mackerel: { normal: rec(1) }, hairtail: { normal: rec(1) }, anglerfish: { normal: rec(1) } };
// 태평양 전설 제외 전부 (일반 폼만) — 기본 라이선스 도감 조건. 희귀 3·영웅 3 추가
const pacificDex = {
  ...pacificCommonDex,
  seabream: { normal: rec(1) }, yellowtail: { normal: rec(1) }, squid: { normal: rec(1) },
  tuna: { normal: rec(1) }, coelacanth: { normal: rec(1) }, oarfish: { normal: rec(1) },
};
// 태평양 전설 포함 전부 (일반 폼만) — 네임드 라이선스 도감 조건. 전설 4 추가
const pacificFullDex = {
  ...pacificDex,
  shark: { normal: rec(1) }, kraken: { normal: rec(1) },
  moonveil: { normal: rec(1) }, abyssveil: { normal: rec(1) },
};
// 서버 주입 — 오늘 클리어 0회·수주 중인 의뢰 없음이 기본값 (라이선스 조건은 상태에서 직접 본다)
const ctx = (over: Partial<BountyCtx> = {}): BountyCtx => ({
  clearsToday: { general: 0, named: 0 }, tickets: [], complete: [], active: [], ...over,
});
const cleared = (general: number, named = 0): BountyCtx['clearsToday'] => ({ general, named });

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

  it('일반 등급만 모았으면 기본 라이선스도 dex-incomplete — 전설 제외 전부(희귀·영웅 포함)가 조건이다', () => {
    const out = applyAction(seed({ ...harbor, fame: 1500, dex: pacificCommonDex }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'dex-incomplete' });
  });

  it('돌연변이 폼만 잡은 어종은 도감 조건에 세지 않는다', () => {
    const variantOnly = { ...pacificDex, tuna: { variant: rec(1) } };
    const out = applyAction(seed({ ...harbor, fame: 1500, dex: variantOnly }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'dex-incomplete' });
  });

  it('도감 미완이면 dex-incomplete', () => {
    const out = applyAction(seed({ ...harbor, fame: 1500 }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx() }));
    expect(out).toEqual({ ok: false, error: 'dex-incomplete' });
  });

  it('일반 의뢰는 하루 1회 클리어 — 오늘 이미 클리어했으면 daily-cleared', () => {
    const out = applyAction(seed({ ...ready }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx({ clearsToday: cleared(1) }) }));
    expect(out).toEqual({ ok: false, error: 'daily-cleared' });
  });

  it('네임드도 하루 1회 클리어 — 오늘 이미 보상을 받았으면 daily-cleared', () => {
    const act = { type: 'acceptQuest', questId: 'pacific-named-megalodon', port: 'harbor' } as const;
    const full = seed({ ...harbor, fame: 1500, dex: pacificFullDex });
    expect(applyAction(full, act, deps({ bounty: ctx({ clearsToday: cleared(0, 1) }) })))
      .toEqual({ ok: false, error: 'daily-cleared' });
  });

  it('한 갈래의 클리어는 다른 갈래의 한도를 먹지 않는다 — 일반을 클리어해도 네임드를 수주할 수 있다', () => {
    const named = { type: 'acceptQuest', questId: 'pacific-named-megalodon', port: 'harbor' } as const;
    const out = applyAction(seed({ ...harbor, fame: 1500, dex: pacificFullDex }), named,
      deps({ bounty: ctx({ clearsToday: cleared(1, 0) }) }));
    if (!out.ok) throw new Error(out.error);
    expect(out.events).toEqual([{ type: 'acceptQuest',
      payload: { questId: 'pacific-named-megalodon', port: 'harbor' } }]);
    // 반대로 네임드를 클리어해도 일반 의뢰는 그대로 열려 있다
    const general = applyAction(seed({ ...ready }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx({ clearsToday: cleared(0, 1) }) }));
    expect(general.ok).toBe(true);
  });

  it('수주만으로는 한도를 쓰지 않는다 — 수주 중이 아니고 클리어 0이면 몇 번째 수주든 통과한다', () => {
    for (const questId of ['pacific-easy-common', 'pacific-normal-rare', 'pacific-hard-epic']) {
      const out = applyAction(seed({ ...ready }), { type: 'acceptQuest', questId, port: 'harbor' },
        deps({ bounty: ctx() }));
      expect(out.ok, questId).toBe(true);
    }
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

  it('일반 의뢰는 한 번에 하나 — 다른 난이도·다른 구역의 일반 의뢰가 진행 중이어도 quest-active', () => {
    const act = { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' } as const;
    for (const active of ['pacific-normal-rare', 'seasia-hard-epic']) {
      expect(applyAction(seed({ ...ready }), act, deps({ bounty: ctx({ active: [active] }) })), active)
        .toEqual({ ok: false, error: 'quest-active' });
    }
  });

  it('마쳤지만 아직 보상을 받지 않은 의뢰도 진행 중이다 — 보상을 받아야 다음 의뢰를 수주한다', () => {
    const out = applyAction(seed({ ...ready }),
      { type: 'acceptQuest', questId: 'pacific-easy-rare', port: 'harbor' },
      deps({ bounty: ctx({ active: ['pacific-easy-common'], complete: ['pacific-easy-common'] }) }));
    expect(out).toEqual({ ok: false, error: 'quest-active' });
  });

  it('네임드는 한 번에 하나 — 진행 중인 네임드가 있으면 다른 구역 네임드도 quest-active', () => {
    const out = applyAction(seed({ ...harbor, fame: 1500, dex: pacificFullDex }),
      { type: 'acceptQuest', questId: 'pacific-named-megalodon', port: 'harbor' },
      deps({ bounty: ctx({ active: ['seasia-named-leviathan'] }) }));
    expect(out).toEqual({ ok: false, error: 'quest-active' });
  });

  it('진행 중인 갈래가 다르면 막지 않는다 — 일반 의뢰를 진행해도 네임드를 수주할 수 있고 그 반대도 같다', () => {
    const named = { type: 'acceptQuest', questId: 'pacific-named-megalodon', port: 'harbor' } as const;
    expect(applyAction(seed({ ...harbor, fame: 1500, dex: pacificFullDex }), named,
      deps({ bounty: ctx({ active: ['pacific-easy-common'] }) })).ok).toBe(true);
    expect(applyAction(seed({ ...ready }),
      { type: 'acceptQuest', questId: 'pacific-easy-common', port: 'harbor' },
      deps({ bounty: ctx({ active: ['pacific-named-megalodon'] }) })).ok).toBe(true);
  });

  it('하루 한도와 진행 중이 함께 걸리면 한도가 먼저다 — 보상을 받아도 오늘은 수주하지 못한다', () => {
    const out = applyAction(seed({ ...ready }),
      { type: 'acceptQuest', questId: 'pacific-easy-rare', port: 'harbor' },
      deps({ bounty: ctx({ clearsToday: cleared(1), active: ['pacific-easy-common'] }) }));
    expect(out).toEqual({ ok: false, error: 'daily-cleared' });
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
    expect(out.state.gold).toBe(20100); // 100 + 보상 20000
    expect(out.events).toEqual([{ type: 'deliverBounty',
      payload: { questId: 'pacific-easy-common', reward: 20000 } }]);
  });

  it('네임드 토벌에는 교환 재료 1개가 따라온다', () => {
    const out = applyAction(seed({ gold: 0 }),
      { type: 'deliverBounty', questId: 'pacific-named-megalodon' },
      deps({ bounty: ctx({ complete: ['pacific-named-megalodon'] }) }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(400000);
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

  it('게이트 확률(1/1000) 밖이면 null', () => {
    expect(rollNamedEncounter(['pacific-named-megalodon'], 'sea', () => 0.999)).toBeNull();
  });

  it('수역 한정 네임드(spot)는 그 수역에서만 조우한다 — 해협에서는 둔클레오스가 돌지 않는다', () => {
    expect(rollNamedEncounter(['madagascar-named-elder-sixgill'], 'mozstrait', () => 0)).toBeNull();
    expect(rollNamedEncounter(['madagascar-named-elder-sixgill'], 'comorodeep', () => 0)?.id)
      .toBe('madagascar-named-elder-sixgill');
  });

  it('게이트 명중이면 그 해역 의뢰를 돌려준다', () => {
    const q = rollNamedEncounter(['pacific-named-megalodon'], 'sea', () => 0);
    expect(q?.id).toBe('pacific-named-megalodon');
  });

  it('강제 조우는 확률 게이트만 건너뛴다 — 수주·해역·수역 조건은 그대로다', () => {
    expect(rollNamedEncounter(['pacific-named-megalodon'], 'sea', () => 0.999, true)?.id)
      .toBe('pacific-named-megalodon');
    expect(rollNamedEncounter([], 'sea', () => 0, true)).toBeNull();
    expect(rollNamedEncounter(['pacific-named-megalodon'], 'dragonhole', () => 0, true)).toBeNull();
    expect(rollNamedEncounter(['madagascar-named-elder-sixgill'], 'mozstrait', () => 0, true)).toBeNull();
  });

  it('강제 조우도 rng 소비 횟수는 같다 — 뒤따르는 통상 추첨 결과가 바뀌지 않는다', () => {
    let forced = 0;
    let natural = 0;
    rollNamedEncounter(['pacific-named-megalodon'], 'sea', () => { forced++; return 0; }, true);
    rollNamedEncounter(['pacific-named-megalodon'], 'sea', () => { natural++; return 0; });
    expect(forced).toBe(natural);
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

  it('강제 조우 표시가 있으면 확률과 무관하게 도전권을 남긴다', () => {
    const out = applyAction(sea, { type: 'catch', spot: 'sea', judgment: 'normal', forceEncounter: true },
      deps({ bounty: ctx({ active: ['pacific-named-megalodon'] }), rng: () => 0.999 }));
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag).toHaveLength(1);
    expect(out.result).toMatchObject({ type: 'catch', ticket: 'pacific-named-megalodon' });
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
    success: true, hits: 6, misses: 0, ...over,
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

  it('주장 정합성이 깨지면 bad-request (네임드 체력 미만 히트로 성공 주장)', () => {
    expect(applyAction(ready(), act({ hits: 4 }), full()))
      .toEqual({ ok: false, error: 'bad-request' });
  });

  it('성공 기준은 네임드 체력이다 — 둔클레오스(체력 8)는 7히트 성공 주장을 거부한다', () => {
    const q = 'madagascar-named-elder-sixgill';
    const madaDeps = () => deps({ ...dyn,
      bounty: ctx({ active: [q], tickets: [{ questId: q, issuedAt: '2026-10-09T00:30:00.000Z' }] }) });
    expect(applyAction(ready(), act({ questId: q, hits: 7 }), madaDeps()))
      .toEqual({ ok: false, error: 'bad-request' });
    expect(applyAction(ready(), act({ questId: q, hits: 8 }), madaDeps()).ok).toBe(true);
  });

  it('성공하면 도감에 오르고 감사 이벤트를 남긴다', () => {
    const out = applyAction(ready(), act(), full());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.dex.megalodon?.normal?.count).toBe(1);
    expect(out.events).toEqual([{ type: 'resolveChallenge',
      payload: { questId: 'pacific-named-megalodon', success: true, hits: 6, misses: 0 } }]);
  });

  it('실패는 감사 이벤트만 남기고 상태가 그대로다 — 티켓 소모는 서버 행 처리다', () => {
    const st = ready();
    const out = applyAction(st,
      act({ success: false, hits: 5, misses: 3 }), full());
    if (!out.ok) throw new Error(out.error);
    expect(out.state).toEqual(st);
    expect(out.events).toEqual([{ type: 'resolveChallenge',
      payload: { questId: 'pacific-named-megalodon', success: false, hits: 5, misses: 3 } }]);
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
