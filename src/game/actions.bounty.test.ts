// 현상금 액션 — 수배 라이선스·수주·납품의 상태 전이 규칙.
// DB 진실(라이선스 소유·일일 카운트·진행도)은 서버가 deps.bounty로 주입한다
// (deps.relief 선례). 로컬 dev엔 주입이 없어 수주·납품이 닫혀 있다.
import { describe, it, expect } from 'vitest';
import { applyAction } from './actions';
import type { ActionDeps } from './actions';
import { newState } from './logic';
import type { GameState } from './logic';
import { matchBountyCatch } from './logic';
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
// 서버 주입 — 라이선스 보유·오늘 0회·완료 없음이 기본값
const ctx = (over = {}) => ({ licensed: ['pacific'], acceptsToday: 0, acceptsAtPortToday: 0, complete: [] as string[], ...over });

describe('acceptBountyLicense', () => {
  it('명성 미달이면 not-enough-fame — 소모 없이 검증만 한다', () => {
    const out = applyAction(seed({ fame: 1499 }), { type: 'acceptBountyLicense', zone: 'pacific' }, deps());
    expect(out).toEqual({ ok: false, error: 'not-enough-fame' });
  });

  it('통과하면 상태 불변 + 감사 이벤트만 남긴다 (행 기록은 서버가 DB에)', () => {
    const st = seed({ fame: 1500 });
    const out = applyAction(st, { type: 'acceptBountyLicense', zone: 'pacific' }, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state).toEqual(st);
    expect(out.events).toEqual([{ type: 'acceptBountyLicense', payload: { zone: 'pacific' } }]);
  });

  it('없는 해역은 bad-request', () => {
    const out = applyAction(seed({ fame: 999999 }), { type: 'acceptBountyLicense', zone: 'atlantis' }, deps());
    expect(out).toEqual({ ok: false, error: 'bad-request' });
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
