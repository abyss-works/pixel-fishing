import { describe, it, expect } from 'vitest';
import {
  achievementProgress, evaluateAchievements, counterIncrementsForEvents,
} from './achievements';
import {
  applyAction, pickScalars, applyPatch,
} from './actions';
import type { ActionDeps, GameEvent } from './actions';
import {
  migrate, newState, sizeParams, BIG_CATCH_PERCENTILE,
} from './logic';
import type { GameState } from './logic';
import {
  canBuyHat, canClaimAchievement, canClaimAllAchievements, REJECT_TEXT,
} from './rules';
import { ACHIEVEMENTS } from '../content/achievements';
import { FISH } from '../content/fish';
import { topZoneOfSpot } from '../content/zones';
import { ARTIFACTS } from '../content/artifacts';
import { BOUNTIES } from '../content/bounties';
import { NAMED } from '../content/named';
import { duelHpOf } from './challenge';

const deps = (over: Partial<ActionDeps> = {}): ActionDeps => ({
  rng: () => 0.5,
  today: '2026-11-15',
  now: '2026-11-15T12:00:00.000Z',
  newUid: () => 'uid-1',
  ...over,
});

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

function bigSizeFor(fish: (typeof FISH)[number]): number {
  const { mean, std } = sizeParams(fish);
  // 평균 + 2*std는 상위 ~2.3%이므로 BIG_CATCH_PERCENTILE(20) 이하
  return Math.ceil(mean + std * 2);
}

describe('업적 진척 판정 (achievementProgress)', () => {
  it('진행 업적은 구역의 일반 폼 발견 수를 센다 (전설 제외/포함)', () => {
    const pacificFish = FISH.filter(f => topZoneOfSpot(f.spot) === 'pacific');
    const basicTargets = pacificFish.filter(f => f.rarity !== 'legendary');
    const dex: GameState['dex'] = {};
    for (const f of basicTargets) {
      dex[f.id] = { normal: { count: 1, maxSize: 10, first: '2026-11-15' } };
    }
    const s = seed({ dex });
    expect(achievementProgress(s, 'zone-basic-pacific')).toEqual({
      current: basicTargets.length, target: basicTargets.length, met: true,
    });
    expect(achievementProgress(s, 'zone-full-pacific')).toEqual({
      current: basicTargets.length, target: pacificFish.length, met: false,
    });
  });

  it('유물 전집(artifact-all)은 artifactLevels가 없어도 state.artifacts만으로 달성된다', () => {
    const s = seed({ artifacts: ARTIFACTS.map(a => a.id) });
    expect(s.artifactLevels).toBeUndefined();
    expect(achievementProgress(s, 'artifact-all')).toEqual({
      current: ARTIFACTS.length, target: ARTIFACTS.length, met: true,
    });
  });

  it('십만 마리 낚시꾼(catch-100000)은 네임드 어종을 제외하고 일반 어종만 센다', () => {
    const namedId = NAMED[0].id;
    const commonFish = FISH[0];
    const s = seed({
      dex: {
        [namedId]: { normal: { count: 100_000, maxSize: null, first: '2026-11-15' } },
        [commonFish.id]: {
          normal: { count: 60_000, maxSize: 10, first: '2026-11-15' },
          variant: { count: 39_999, maxSize: 10, first: '2026-11-15' },
        },
      },
    });
    expect(achievementProgress(s, 'catch-100000')).toEqual({
      current: 99_999, target: 100_000, met: false,
    });

    const s2 = seed({
      dex: {
        ...s.dex,
        [commonFish.id]: {
          normal: { count: 60_000, maxSize: 10, first: '2026-11-15' },
          variant: { count: 40_000, maxSize: 10, first: '2026-11-15' },
        },
      },
    });
    expect(achievementProgress(s2, 'catch-100000')).toEqual({
      current: 100_000, target: 100_000, met: true,
    });
  });

  it('월척 장부(big-50)는 일반 또는 돌연변이 중 하나라도 월척 기준 이상이면 1종으로 센다', () => {
    expect(BIG_CATCH_PERCENTILE).toBe(20);
    const dex: GameState['dex'] = {};
    for (let i = 0; i < 50; i++) {
      const f = FISH[i];
      const form = i % 2 === 0 ? 'normal' : 'variant';
      dex[f.id] = { [form]: { count: 1, maxSize: bigSizeFor(f), first: '2026-11-15' } };
    }
    expect(achievementProgress(seed({ dex }), 'big-50')).toEqual({
      current: 50, target: 50, met: true,
    });
  });

  it('수배판 완결(named-all)은 전체 네임드 의뢰가 clearedNamed에 있으면 달성된다', () => {
    const namedQuests = BOUNTIES.filter(q => q.difficulty === 'named');
    const partial = seed({ clearedNamed: [namedQuests[0].id] });
    expect(achievementProgress(partial, 'named-all')).toEqual({
      current: 1, target: namedQuests.length, met: false,
    });
    const full = seed({ clearedNamed: namedQuests.map(q => q.id) });
    expect(achievementProgress(full, 'named-all')).toEqual({
      current: namedQuests.length, target: namedQuests.length, met: true,
    });
  });

  it('전설 도감과 한밤 도감/돌연변이 도감, 구역별 돌연변이 도감을 판정한다', () => {
    const dex: GameState['dex'] = {};
    for (const f of FISH) {
      dex[f.id] = {
        normal: { count: 1, maxSize: 10, first: '2026-11-15' },
        variant: { count: 1, maxSize: 10, first: '2026-11-15' },
      };
    }
    const full = seed({ dex });
    for (const id of [
      'variant-village', 'variant-pacific', 'variant-seasia', 'variant-indian',
      'variant-madagascar', 'variant-southatlantic', 'variant-all',
      'grade-legendary', 'night-normal', 'night-variant',
    ]) {
      const p = achievementProgress(full, id);
      expect(p.target, id).toBeGreaterThan(0);
      expect(p.met, id).toBe(true);
    }
    expect(achievementProgress(full, 'unknown-id')).toEqual({ current: 0, target: 0, met: false });
  });
});

describe('세이브 이관과 전방 호환 (migrate)', () => {
  it('모르는 미래 업적 ID가 든 세이브를 migrate해도 사라지지 않는다', () => {
    const saved = {
      ...newState(),
      achievements: { 'future-ach': 'claimed', 'zone-basic-pacific': 'claimable', bad: 'invalid' },
      achievementCounters: { 'sell.gold': 123, 'catch.perfect': -1, unknown: 5 },
      clearedNamed: ['pacific-named-megalodon', 'pacific-named-megalodon', 42],
    };
    const m = migrate(saved);
    expect(m.achievements).toEqual({ 'future-ach': 'claimed', 'zone-basic-pacific': 'claimable' });
    expect(m.achievementCounters).toEqual({ 'sell.gold': 123 });
    expect(m.clearedNamed).toEqual(['pacific-named-megalodon']);
  });
});

describe('업적 규칙과 액션 (rules, actions)', () => {
  it('업적 모자(straw-hat)에 buyHat을 호출하면 achievement-hat-only로 거절되고 골드가 깎이지 않는다', () => {
    const s = seed({ gold: 1_000_000 });
    expect(canBuyHat(s, 'straw-hat')).toEqual({ ok: false, reason: 'achievement-hat-only' });
    expect(REJECT_TEXT['achievement-hat-only']).toBe('업적 모자는 업적을 달성해야 받을 수 있어요.');
    const out = applyAction(s, { type: 'buyHat', hat: 'straw-hat' }, deps());
    expect(out).toEqual({ ok: false, error: 'achievement-hat-only' });
  });

  it('기존 조건을 이미 만족한 세이브가 아무 상태 변경 액션을 거치면 즉시 claimable이 되고 보상은 자동 지급되지 않는다', () => {
    const s = seed({ gold: 0, artifacts: ARTIFACTS.map(a => a.id) });
    const out = applyAction(s, { type: 'boot' }, deps());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.achievements['artifact-all']).toBe('claimable');
    expect(out.state.hats).toEqual([]);
    expect(out.events).toContainEqual({ type: 'unlockAchievement', payload: { id: 'artifact-all' } });
  });

  it('이미 claimed인 업적을 다시 claimAchievement하면 achievement-already-claimed로 거절된다', () => {
    const s = seed({ gold: 0, achievements: { 'zone-basic-pacific': 'claimable' } });
    const first = applyAction(s, { type: 'claimAchievement', id: 'zone-basic-pacific' }, deps());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.gold).toBe(25_000);
    expect(first.state.achievements['zone-basic-pacific']).toBe('claimed');
    expect(first.events).toContainEqual({
      type: 'claimAchievement', payload: { id: 'zone-basic-pacific', gold: 25_000 },
    });

    expect(canClaimAchievement(first.state, 'zone-basic-pacific')).toEqual({
      ok: false, reason: 'achievement-already-claimed',
    });
    const second = applyAction(first.state, { type: 'claimAchievement', id: 'zone-basic-pacific' }, deps());
    expect(second).toEqual({ ok: false, error: 'achievement-already-claimed' });
  });

  it('claimAllAchievements는 claimable 업적의 골드와 모자를 순서대로 모두 지급한다', () => {
    const s = seed({
      gold: 100,
      hats: ['straw-hat'],
      achievements: {
        'zone-basic-pacific': 'claimable',
        'variant-village': 'claimable',
        'artifact-all': 'claimable',
        'zone-full-pacific': 'claimed',
      },
    });
    const out = applyAction(s, { type: 'claimAllAchievements' }, deps());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.gold).toBe(25_100);
    expect(out.state.hats).toEqual(['straw-hat', 'shipowner-bowler']);
    expect(out.state.achievements['zone-basic-pacific']).toBe('claimed');
    expect(out.state.achievements['variant-village']).toBe('claimed');
    expect(out.state.achievements['artifact-all']).toBe('claimed');
    // 모두 받기 결과는 받은 골드 합계와 모자 목록을 싣는다 — 클라가 수령 문구를 만들 수 있게 한다
    expect(out.result).toEqual({
      type: 'claimAllAchievements',
      gold: 25_000,
      hats: ['shipowner-bowler'],
    });
    expect(out.events).toContainEqual({
      type: 'claimAllAchievements',
      payload: {
        ids: ['zone-basic-pacific', 'variant-village', 'artifact-all'],
        gold: 25_000,
        hats: ['shipowner-bowler'],
      },
    });
    expect(canClaimAllAchievements(out.state)).toEqual({ ok: false, reason: 'no-claimable-achievements' });
  });

  it('게스트는 캐치·판매 시 카운터 증가와 claimable 전이는 되지만 수령은 account-only로 거절된다', () => {
    const s = seed({
      artifacts: ARTIFACTS.map(a => a.id),
    });
    const caught = applyAction(s, { type: 'catch', spot: 'pond', judgment: 'auto' }, deps({ guest: true }));
    expect(caught.ok).toBe(true);
    if (!caught.ok) return;
    expect(caught.state.achievementCounters['catch.auto']).toBe(1);
    expect(caught.state.achievements['artifact-all']).toBe('claimable');

    expect(canClaimAchievement(caught.state, 'artifact-all', true)).toEqual({ ok: false, reason: 'account-only' });
    expect(canClaimAllAchievements(caught.state, true)).toEqual({ ok: false, reason: 'account-only' });
    expect(applyAction(caught.state, { type: 'claimAchievement', id: 'artifact-all' }, deps({ guest: true })))
      .toEqual({ ok: false, error: 'account-only' });
    expect(applyAction(caught.state, { type: 'claimAllAchievements' }, deps({ guest: true })))
      .toEqual({ ok: false, error: 'account-only' });
  });

  it('counterIncrementsForEvents가 5개 카운터 증분을 정확히 계산한다', () => {
    const events: GameEvent[] = [
      { type: 'sell', payload: { gold: 1500, count: 2, uids: ['a', 'b'] } },
      { type: 'catch', payload: { judgment: 'perfect', bait: 'cook-bait-rare' } },
      { type: 'catch', payload: { judgment: 'auto', lunch: 'cook-lunch-bite' } },
      { type: 'resolveChallenge', payload: { questId: 'pacific-named-megalodon', success: true, hits: 5, misses: 0 } },
      { type: 'resolveChallenge', payload: { questId: 'seasia-named-leviathan', success: true, hits: 5, misses: 1 } },
    ];
    expect(counterIncrementsForEvents(events)).toEqual({
      'sell.gold': 1500,
      'catch.perfect': 1,
      'catch.auto': 1,
      'catch.bait': 1,
      'named.flawless': 1,
    });
  });

  it('resolveChallenge 성공 시 clearedNamed에 questId가 추가되고 pickScalars에 새 필드가 포함된다', () => {
    const s = seed({ gold: 0 });
    const hits = duelHpOf('pacific-named-megalodon', s.namedPity, '2026-11-15T12:00:00.000Z')!;
    const out = applyAction(s, {
      type: 'resolveChallenge', questId: 'pacific-named-megalodon', success: true, hits, misses: 0,
    }, deps({
      bounty: {
        clearsToday: { general: 0, named: 0 },
        active: ['pacific-named-megalodon'],
        complete: [],
        tickets: [{ questId: 'pacific-named-megalodon', issuedAt: '2026-11-15T11:59:00.000Z' }],
      },
    }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.clearedNamed).toEqual(['pacific-named-megalodon']);
    expect(out.state.achievementCounters['named.flawless']).toBe(1);
    const scalars = pickScalars(out.state);
    expect(scalars.clearedNamed).toEqual(['pacific-named-megalodon']);
    expect(scalars.achievementCounters).toEqual({ 'named.flawless': 1 });
    expect(scalars.achievements).toEqual({});
    const patched = applyPatch(s, { version: 2, baseVersion: 1, scalars, writes: out.writes });
    expect(patched.clearedNamed).toEqual(['pacific-named-megalodon']);
  });

  it('evaluateAchievements는 이미 claimable/claimed인 항목과 모르는 키를 유지한다', () => {
    const s = seed({
      achievements: { 'artifact-all': 'claimed', 'future-ach': 'claimable' },
      artifacts: ARTIFACTS.map(a => a.id),
    });
    const ev = evaluateAchievements(s);
    expect(ev.newlyClaimable).toEqual([]);
    expect(ev.achievements).toEqual({ 'artifact-all': 'claimed', 'future-ach': 'claimable' });
  });

  it('REJECT_TEXT에 업적 관련 문구가 모두 정의되어 있다', () => {
    expect(REJECT_TEXT['account-only']).toBeTruthy();
    expect(REJECT_TEXT['achievement-already-claimed']).toBe('이미 받은 업적이에요.');
    expect(REJECT_TEXT['achievement-not-claimable']).toBe('아직 받을 수 없는 업적이에요.');
    expect(REJECT_TEXT['no-claimable-achievements']).toBe('받을 수 있는 업적이 없어요.');
    expect(ACHIEVEMENTS).toHaveLength(24);
  });
});
