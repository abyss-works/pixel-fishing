import { describe, it, expect } from 'vitest';
import {
  achievementBonusesOf,
  achievementBonusContributions,
  achievementProgress,
  counterIncrementsForEvents,
  cumulativeBonusProgress,
  evaluateAchievements,
  maxArtifactCount,
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
import { ACHIEVEMENTS, CUMULATIVE_BONUS_SERIES } from '../content/achievements';
import { FISH } from '../content/fish';
import { topZoneOfSpot } from '../content/zones';
import { ARTIFACTS, ARTIFACT_MAX_LEVEL, artifactHasLevel } from '../content/artifacts';
import { BOUNTIES } from '../content/bounties';
import { NAMED } from '../content/named';
import { duelHpOf } from './challenge';
import { catchTooSoon } from './pacing';
import { biteWaitOf, createPlayerContext } from './effects';
import { NO_GUILD_EFFECTS } from './guild';
import { CATCH_MS } from './balance';

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
  it('진행 업적은 해역의 일반 폼 발견 수를 센다 (전설 제외/포함)', () => {
    const seaFish = FISH.filter(f => f.spot === 'sea');
    const basicTargets = seaFish.filter(f => f.rarity !== 'legendary');
    const dex: GameState['dex'] = {};
    for (const f of basicTargets) {
      dex[f.id] = { normal: { count: 1, maxSize: 10, first: '2026-11-15' } };
    }
    const s = seed({ dex });
    expect(achievementProgress(s, 'spot-basic-sea')).toEqual({
      current: basicTargets.length, target: basicTargets.length, met: true,
    });
    expect(achievementProgress(s, 'spot-full-sea')).toEqual({
      current: basicTargets.length, target: seaFish.length, met: false,
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

  it('월척 장부(big-50)와 월척 백 종(big-100-hat)은 일반 또는 돌연변이 중 하나라도 월척 기준 이상이면 1종으로 센다', () => {
    expect(BIG_CATCH_PERCENTILE).toBe(20);
    const dex: GameState['dex'] = {};
    for (let i = 0; i < 100; i++) {
      const f = FISH[i];
      const form = i % 2 === 0 ? 'normal' : 'variant';
      dex[f.id] = { [form]: { count: 1, maxSize: bigSizeFor(f), first: '2026-11-15' } };
    }
    expect(achievementProgress(seed({ dex }), 'big-50')).toEqual({
      current: 100, target: 50, met: true,
    });
    expect(achievementProgress(seed({ dex }), 'big-100-hat')).toEqual({
      current: 100, target: 100, met: true,
    });
  });

  it('수배판 완결(named-all)과 네임드 다회 토벌(1·5·10회)은 clearedNamed 기록 횟수를 정확히 센다', () => {
    const namedQuests = BOUNTIES.filter(q => q.difficulty === 'named');
    const fiveMegalodon = Array.from({ length: 5 }, () => 'pacific-named-megalodon');
    const s = seed({ clearedNamed: fiveMegalodon });
    expect(achievementProgress(s, 'named-all')).toEqual({
      current: 1, target: namedQuests.length, met: false,
    });
    expect(achievementProgress(s, 'named-megalodon-1')).toEqual({ current: 5, target: 1, met: true });
    expect(achievementProgress(s, 'named-megalodon-5')).toEqual({ current: 5, target: 5, met: true });
    expect(achievementProgress(s, 'named-megalodon-10')).toEqual({ current: 5, target: 10, met: false });

    const full = seed({ clearedNamed: namedQuests.map(q => q.id) });
    expect(achievementProgress(full, 'named-all')).toEqual({
      current: namedQuests.length, target: namedQuests.length, met: true,
    });
  });

  it('전설 도감, 구역별 한밤 도감/돌연변이 도감, 구역별 돌연변이 도감을 판정한다', () => {
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
      'grade-legendary',
      'night-normal', 'night-variant',
      'night-seasia-normal', 'night-seasia-variant',
      'night-indian-normal', 'night-indian-variant',
      'night-madagascar-normal', 'night-madagascar-variant',
      'night-southatlantic-normal', 'night-southatlantic-variant',
    ]) {
      const p = achievementProgress(full, id);
      expect(p.target, id).toBeGreaterThan(0);
      expect(p.met, id).toBe(true);
    }
    expect(achievementProgress(full, 'unknown-id')).toEqual({ current: 0, target: 0, met: false });
  });
});

describe('누적 보너스 계산 (achievementBonusesOf)', () => {
  it('maxArtifactCount는 Lv5 유물과 전설 유물(고정 레벨)을 모두 포함한다', () => {
    const levelable = ARTIFACTS.filter(a => artifactHasLevel(a));
    const legendary = ARTIFACTS.filter(a => !artifactHasLevel(a));
    expect(legendary.length).toBeGreaterThan(0);

    const partial = seed({
      artifacts: [levelable[0].id, levelable[1].id, legendary[0].id],
      artifactLevels: { [levelable[0].id]: ARTIFACT_MAX_LEVEL, [levelable[1].id]: 4 },
    });
    expect(maxArtifactCount(partial)).toBe(2);

    const allMax = seed({
      artifacts: ARTIFACTS.map(a => a.id),
      artifactLevels: Object.fromEntries(levelable.map(a => [a.id, ARTIFACT_MAX_LEVEL])),
    });
    expect(maxArtifactCount(allMax)).toBe(ARTIFACTS.length);
  });

  it('모든 누적 보너스 단계가 최대일 때 단계별 최대 합산치와 정확히 일치한다', () => {
    const pacificLegend = FISH.find(f => topZoneOfSpot(f.spot) === 'pacific' && f.rarity === 'legendary')!;
    const levelable = ARTIFACTS.filter(a => artifactHasLevel(a));
    const s = seed({
      artifacts: ARTIFACTS.map(a => a.id),
      artifactLevels: Object.fromEntries(levelable.map(a => [a.id, ARTIFACT_MAX_LEVEL])),
      achievementCounters: {
        'manual.total': 10_000,
        'manual.legendary.total': 25,
        'manual.variant.total': 25,
        'catch.auto': 100_000,
        'catch.perfect': 10_000,
        'catch.bait': 1_000,
        'named.flawless': 50,
        'sell.gold': 100_000_000,
        [`manual.legendary.${pacificLegend.id}`]: 5,
        'manual.variant.pacific': 10,
      },
    });
    const b = achievementBonusesOf(s);
    expect(b.biteWaitCut).toBe(0.10);
    expect(b.mutationWeight).toBe(0.08);
    expect(b.rareWeight).toBe(0.04);
    expect(b.epicWeight).toBe(0.03);
    expect(b.legendaryWeight).toBe(0.04);
    expect(b.sellBonus).toBe(0.03);
    expect(b.namedWeight).toBe(0.10);
    expect(b.moveSpeed).toBe(0);
    expect(b.artifactBoost).toBe(0.15);
    expect(b.zoneLegendary.pacific).toBe(0.06);
    expect(b.zoneMutation.pacific).toBe(0.09);

    const contribs = achievementBonusContributions(s);
    expect(contribs.length).toBe(11);
  });

  it('cumulativeBonusProgress는 현재 단계와 다음 단계를 정확히 계산한다', () => {
    const manualSeries = CUMULATIVE_BONUS_SERIES.find(s => s.id === 'bonus-manual-total')!;
    const p = cumulativeBonusProgress(seed({ achievementCounters: { 'manual.total': 1_240 } }), manualSeries);
    expect(p.current).toBe(1_240);
    expect(p.completedSteps).toBe(3);
    expect(p.activeDelta).toBe(0.035);
    expect(p.maxDelta).toBe(0.05);
    expect(p.nextStep?.threshold).toBe(10_000);
  });

  it('catchTooSoon은 누적 입질 대기 단축과 유물 배율을 반영해 정상 빠른 캐치를 429 오탐하지 않는다', () => {
    const T0 = '2026-11-15T12:00:00.000Z';
    const levelable = ARTIFACTS.filter(a => artifactHasLevel(a));
    const boosted = seed({
      rod: 10,
      artifacts: ARTIFACTS.map(a => a.id),
      artifactLevels: Object.fromEntries(levelable.map(a => [a.id, ARTIFACT_MAX_LEVEL])),
      achievementCounters: {
        'manual.total': 10_000,
        'manual.legendary.total': 25,
        'catch.auto': 100_000,
        'catch.perfect': 10_000,
        'catch.bait': 1_000,
      },
    });
    const ctx = createPlayerContext({
      state: boosted,
      guild: NO_GUILD_EFFECTS,
      now: T0,
      achievements: achievementBonusesOf(boosted),
    });
    const cycleMs = CATCH_MS + biteWaitOf(ctx, 'pond', 'idle').min.value * 1000;
    const atExact = new Date(Date.parse(T0) + Math.ceil(cycleMs)).toISOString();
    expect(catchTooSoon(boosted, 'pond', T0, atExact)).toBe(false);
    // 보너스가 없는 상태에서는 같은 간격이 너무 빠르다고 판정된다
    expect(catchTooSoon(seed({ rod: 10 }), 'pond', T0, atExact)).toBe(true);
  });
});

describe('세이브 이관과 전방 호환 (migrate)', () => {
  it('모르는 미래 업적 ID와 폐지된 옛 ID, 중복 네임드 토벌 기록이 migrate 후에도 보존된다', () => {
    const saved = {
      ...newState(),
      achievements: { 'future-ach': 'claimed', 'zone-basic-pacific': 'claimable', bad: 'invalid' },
      achievementCounters: {
        'sell.gold': 123, 'catch.perfect': -1, unknown: 5,
        'manual.total': 5, 'manual.total.village': 3, 'manual.legendary.goldcarp': 1,
      },
      clearedNamed: ['pacific-named-megalodon', 'pacific-named-megalodon', 42],
    };
    const m = migrate(saved);
    expect(m.achievements).toEqual({ 'future-ach': 'claimed', 'zone-basic-pacific': 'claimable' });
    expect(m.achievementCounters).toEqual({
      'sell.gold': 123, 'manual.total': 5, 'manual.total.village': 3, 'manual.legendary.goldcarp': 1,
    });
    expect(m.clearedNamed).toEqual(['pacific-named-megalodon', 'pacific-named-megalodon']);
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

  it('폐지된 옛 업적 id는 수령이 거절되고 저장 키만 보존된다', () => {
    const raw = migrate({ achievements: { 'zone-basic-pacific': 'claimable', 'manual-variant-1': 'claimable', 'no-such': 'claimed' } });
    expect(raw.achievements).toEqual({
      'zone-basic-pacific': 'claimable',
      'manual-variant-1': 'claimable',
      'no-such': 'claimed',
    });

    expect(canClaimAchievement(raw, 'zone-basic-pacific')).toEqual({ ok: false, reason: 'bad-request' });
    expect(canClaimAchievement(raw, 'manual-variant-1')).toEqual({ ok: false, reason: 'bad-request' });
    expect(applyAction(raw, { type: 'claimAchievement', id: 'zone-basic-pacific' }, deps()))
      .toEqual({ ok: false, error: 'bad-request' });
    expect(canClaimAllAchievements(raw)).toEqual({ ok: false, reason: 'no-claimable-achievements' });
    expect(applyAction(raw, { type: 'claimAllAchievements' }, deps()))
      .toEqual({ ok: false, error: 'no-claimable-achievements' });
  });

  it('claimAllAchievements는 현행 claimable 업적의 골드와 모자만 지급하고 폐지된 옛 id는 건드리지 않는다', () => {
    const s = seed({
      gold: 100,
      hats: ['straw-hat'],
      achievements: {
        'spot-basic-sea': 'claimable',
        'variant-village': 'claimable',
        'artifact-all': 'claimable',
        'zone-basic-pacific': 'claimable',
        'manual-variant-1': 'claimable',
        'spot-full-sea': 'claimed',
      },
    });
    const out = applyAction(s, { type: 'claimAllAchievements' }, deps());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.gold).toBe(100 + 300);
    expect(out.state.hats).toEqual(['straw-hat', 'shipowner-bowler']);
    expect(out.state.achievements['spot-basic-sea']).toBe('claimed');
    expect(out.state.achievements['variant-village']).toBe('claimed');
    expect(out.state.achievements['artifact-all']).toBe('claimed');
    expect(out.state.achievements['zone-basic-pacific']).toBe('claimable');
    expect(out.state.achievements['manual-variant-1']).toBe('claimable');
    expect(out.result).toEqual({
      type: 'claimAllAchievements',
      gold: 300,
      hats: ['shipowner-bowler'],
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

  it('counterIncrementsForEvents가 기본 카운터 증분을 정확히 계산한다', () => {
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
      'manual.total': 1,
    });
  });

  it('수동 총계·구역 총계·전설·돌연변이 카운터를 어종 데이터에서 증분한다', () => {
    const legendary = FISH.find(f => f.rarity === 'legendary')!;
    const ordinary = FISH.find(f => f.rarity === 'common')!;
    const legZone = topZoneOfSpot(legendary.spot);
    const ordZone = topZoneOfSpot(ordinary.spot);
    const inc = counterIncrementsForEvents([
      { type: 'catch', payload: { fishId: legendary.id, judgment: 'perfect', form: 'normal', spot: legendary.spot } },
      { type: 'catch', payload: { fishId: ordinary.id, judgment: 'good', form: 'variant', spot: ordinary.spot } },
      { type: 'catch', payload: { fishId: legendary.id, judgment: 'auto', form: 'variant', spot: legendary.spot } },
    ]);
    const expectedZoneTotals: Record<string, number> = {};
    expectedZoneTotals[`manual.total.${legZone}`] = (expectedZoneTotals[`manual.total.${legZone}`] ?? 0) + 1;
    expectedZoneTotals[`manual.total.${ordZone}`] = (expectedZoneTotals[`manual.total.${ordZone}`] ?? 0) + 1;

    expect(inc).toEqual({
      'catch.perfect': 1,
      'catch.auto': 1,
      'manual.total': 2,
      ...expectedZoneTotals,
      'manual.legendary.total': 1,
      [`manual.legendary.${legendary.id}`]: 1,
      'manual.variant.total': 1,
      [`manual.variant.${ordZone}`]: 1,
    });
  });

  it('resolveChallenge 성공 시 clearedNamed에 questId가 누적되고 pickScalars에 새 필드가 포함된다', () => {
    const s = seed({ gold: 0, clearedNamed: ['pacific-named-megalodon'] });
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
    expect(out.state.clearedNamed).toEqual(['pacific-named-megalodon', 'pacific-named-megalodon']);
    expect(out.state.achievementCounters['named.flawless']).toBe(1);
    const scalars = pickScalars(out.state);
    expect(scalars.clearedNamed).toEqual(['pacific-named-megalodon', 'pacific-named-megalodon']);
    expect(scalars.achievementCounters).toEqual({ 'named.flawless': 1 });
    expect(scalars.achievements).toEqual({ 'named-megalodon-1': 'claimable' });
    const patched = applyPatch(s, { version: 2, baseVersion: 1, scalars, writes: out.writes });
    expect(patched.clearedNamed).toEqual(['pacific-named-megalodon', 'pacific-named-megalodon']);
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
    expect(ACHIEVEMENTS).toHaveLength(80);
  });
});
