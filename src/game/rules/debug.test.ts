// 개발 도구 서버 명령 — debug 액션의 리듀서 몫과 forcePhase 캐치 판정 검증.
import { describe, it, expect } from 'vitest';
import { applyAction, prepareCatchDraw } from './actions';
import type { ActionDeps } from './actions';
import {
  isBigSize, licenseConditions, newState, zoneDexMissing,
} from './logic';
import type { GameState } from './logic';
import { DEBUG_COMMAND_IDS, DEBUG_TABLE_COMMANDS } from './debug';
import { artifactById } from '../content/artifacts';
import { FISH, fishById } from '../content/fish';
import { NAMED } from '../content/named';
import { HATS } from '../content/wardrobe';
import { ENERGY_ITEM_IDS, toStoredEnergy } from '../content/cooking';
import { achievementBonusesOf } from './achievements';
import { powerZones } from './stats';

const deps: ActionDeps = {
  rng: () => 0, today: '2026-10-16', now: '2026-10-16T03:00:00.000Z', newUid: () => 'uid-1',
};
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const debug = (state: GameState, command: string, args?: Record<string, unknown>, over: Partial<ActionDeps> = {}) =>
  applyAction(state, { type: 'debug', command, args }, { ...deps, ...over });

describe('debug 액션 — 공통', () => {
  it('모르는 명령은 bad-request', () => {
    expect(debug(seed(), 'nope')).toEqual({ ok: false, error: 'bad-request' });
  });

  it('모든 명령은 명령 id와 인자를 debug 감사 이벤트로 남긴다', () => {
    const out = debug(seed(), 'bounty.clearTickets');
    if (!out.ok) throw new Error(out.error);
    expect(out.events).toEqual([{ type: 'debug', payload: { command: 'bounty.clearTickets', args: {} } }]);
  });

  it('전용 테이블 명령은 상태를 바꾸지 않는다 — 행은 서버가 이벤트를 보고 쓴다', () => {
    const state = seed();
    for (const command of DEBUG_TABLE_COMMANDS) {
      const out = debug(state, command);
      if (!out.ok) throw new Error(`${command}: ${out.error}`);
      expect(out.state).toBe(state);
    }
    expect(DEBUG_TABLE_COMMANDS.every(c => DEBUG_COMMAND_IDS.includes(c))).toBe(true);
  });
});

describe('stats.set', () => {
  it('준 값만 바꾼다', () => {
    const out = debug(seed({ gold: 1, fame: 2 }), 'stats.set', { fame: 300000, boat: 2 });
    if (!out.ok) throw new Error(out.error);
    expect(out.state).toMatchObject({ gold: 1, fame: 300000, boat: 2 });
  });

  it('빈 입력·음수·소수 낚싯대·범위 밖 배는 bad-request', () => {
    expect(debug(seed(), 'stats.set', {})).toEqual({ ok: false, error: 'bad-request' });
    expect(debug(seed(), 'stats.set', { gold: -1 })).toEqual({ ok: false, error: 'bad-request' });
    expect(debug(seed(), 'stats.set', { rod: 1.5 })).toEqual({ ok: false, error: 'bad-request' });
    expect(debug(seed(), 'stats.set', { boat: 99 })).toEqual({ ok: false, error: 'bad-request' });
    expect(debug(seed(), 'stats.set', { fame: '많이' })).toEqual({ ok: false, error: 'bad-request' });
  });
});

describe('dex.completeZone', () => {
  it('구역 도감을 채워 네임드 라이선스 도감 조건을 만족시킨다 — 판정 함수와 같은 기준', () => {
    const out = debug(seed(), 'dex.completeZone', { zone: 'madagascar' });
    if (!out.ok) throw new Error(out.error);
    expect(zoneDexMissing(out.state, 'madagascar', ['common', 'rare', 'epic', 'legendary'])).toEqual([]);
    expect(licenseConditions(out.state, 'madagascar', 'named').find(c => c.key === 'dex')?.ok).toBe(true);
  });

  it('이미 잡은 기록은 건드리지 않고, 새 기록은 첫 조우일을 오늘로 둔다', () => {
    const kept = { count: 7, maxSize: 30, first: '2026-01-01' };
    const out = debug(seed({ dex: { mackerel: { normal: kept } } }), 'dex.completeZone', { zone: 'pacific' });
    if (!out.ok) throw new Error(out.error);
    expect(out.state.dex.mackerel?.normal).toEqual(kept);
    expect(out.state.dex.hairtail?.normal).toEqual({ count: 1, maxSize: null, first: '2026-10-16' });
  });

  it('없는 구역은 bad-request', () => {
    expect(debug(seed(), 'dex.completeZone', { zone: 'atlantis' })).toEqual({ ok: false, error: 'bad-request' });
  });
});

describe('dex.fill / dex.reset', () => {
  it('마을 포함 구역과 전체 도감의 일반·돌연변이·대어 크기를 채운다', () => {
    const village = debug(seed(), 'dex.fill', { zone: 'village', form: 'variant', big: true });
    if (!village.ok) throw new Error(village.error);
    const crucian = fishById('crucian')!;
    expect(village.state.dex.crucian?.normal).toBeUndefined();
    expect(village.state.dex.crucian?.variant?.count).toBe(1);
    expect(isBigSize(crucian, village.state.dex.crucian!.variant!.maxSize!)).toBe(true);

    const all = debug(seed(), 'dex.fill', { zone: 'all', form: 'both', big: true });
    if (!all.ok) throw new Error(all.error);
    for (const f of FISH) {
      expect(all.state.dex[f.id]?.normal?.count).toBe(1);
      expect(all.state.dex[f.id]?.variant?.count).toBe(1);
      expect(isBigSize(f, all.state.dex[f.id]!.normal!.maxSize!)).toBe(true);
    }
    expect(all.state.dex.megalodon).toBeUndefined();

    const withNamed = debug(seed(), 'dex.fill', { zone: 'all', form: 'both', big: true, includeNamed: true });
    if (!withNamed.ok) throw new Error(withNamed.error);
    for (const n of NAMED) {
      expect(withNamed.state.dex[n.id]?.normal?.count).toBe(1);
    }
    expect(withNamed.state.clearedNamed).toHaveLength(NAMED.length);

    const northOnly = debug(seed(), 'dex.fill', { zone: 'northatlantic', form: 'normal', includeNamed: true });
    if (!northOnly.ok) throw new Error(northOnly.error);
    expect(northOnly.state.dex['gloucester-serpent']?.normal?.count).toBe(1);
    expect(northOnly.state.dex.guabancex?.normal?.count).toBe(1);
    expect(northOnly.state.dex.megalodon).toBeUndefined();
    expect(northOnly.state.clearedNamed.sort()).toEqual(['northatlantic-named-gloucester-serpent', 'northatlantic-named-guabancex']);
  });

  it('dex.reset은 지정 구역 도감을 비우고 writes.recordsRemoved를 생성하며 조건이 깨진 미수령 claimable 업적을 회수한다', () => {
    const filled = debug(seed({
      clearedNamed: ['pacific-named-megalodon'],
      dex: { megalodon: { normal: { count: 1, maxSize: null, first: '2026-10-16' } } },
    }), 'dex.fill', { zone: 'pacific', form: 'both', includeNamed: true });
    if (!filled.ok) throw new Error(filled.error);
    expect(filled.state.achievements['spot-basic-sea']).toBe('claimable');
    expect(filled.state.achievements['variant-pacific']).toBe('claimable');
    expect(filled.state.achievements['named-megalodon-1']).toBe('claimable');

    const resetOnlyFish = debug({ ...filled.state, achievements: { ...filled.state.achievements, 'spot-basic-sea': 'claimed' } },
      'dex.reset', { zone: 'pacific', includeNamed: false });
    if (!resetOnlyFish.ok) throw new Error(resetOnlyFish.error);
    expect(resetOnlyFish.state.dex.mackerel).toBeUndefined();
    expect(resetOnlyFish.state.dex.megalodon).toBeDefined();
    expect(resetOnlyFish.state.clearedNamed).toEqual(['pacific-named-megalodon']);
    expect(resetOnlyFish.writes.recordsRemoved?.some(r => r.fishId === 'mackerel')).toBe(true);
    expect(resetOnlyFish.state.achievements['variant-pacific']).toBeUndefined();
    expect(resetOnlyFish.state.achievements['spot-basic-sea']).toBe('claimed');
    expect(resetOnlyFish.state.achievements['named-megalodon-1']).toBe('claimable');

    const resetAll = debug(filled.state, 'dex.reset', { zone: 'pacific', includeNamed: true });
    if (!resetAll.ok) throw new Error(resetAll.error);
    expect(resetAll.state.dex.megalodon).toBeUndefined();
    expect(resetAll.state.clearedNamed).toEqual([]);
    expect(resetAll.state.achievements['named-megalodon-1']).toBeUndefined();
  });
});

describe('named.unlock / named.reset', () => {
  it('네임드 도감과 토벌 기록(clearedNamed)을 함께 열고 지운다', () => {
    const unlocked = debug(seed(), 'named.unlock', { namedId: 'all' });
    if (!unlocked.ok) throw new Error(unlocked.error);
    for (const n of NAMED) {
      expect(unlocked.state.dex[n.id]?.normal?.count).toBe(1);
    }
    expect(unlocked.state.clearedNamed).toHaveLength(NAMED.length);
    expect(unlocked.state.achievements['named-all']).toBe('claimable');

    const resetOne = debug(unlocked.state, 'named.reset', { namedId: 'guabancex' });
    if (!resetOne.ok) throw new Error(resetOne.error);
    expect(resetOne.state.dex.guabancex).toBeUndefined();
    expect(resetOne.state.clearedNamed).not.toContain('northatlantic-named-guabancex');
    expect(resetOne.writes.recordsRemoved).toEqual([{ fishId: 'guabancex', form: 'normal' }]);
    expect(resetOne.state.achievements['named-all']).toBeUndefined();

    expect(debug(seed(), 'named.unlock', { namedId: 'megalodon', consumeDailyCap: true }).ok).toBe(true);
    expect(debug(seed(), 'named.unlock', { namedId: 'megalodon', consumeDailyCap: 'yes' })).toEqual({ ok: false, error: 'bad-request' });
  });
});

describe('items.grant / cooking.finish / artifact.set / hat.set', () => {
  it('기운(화면 단위→저장 단위), 요리, 유물 재료를 지급한다', () => {
    const e = debug(seed(), 'items.grant', { itemId: ENERGY_ITEM_IDS.common, count: 600 });
    if (!e.ok) throw new Error(e.error);
    expect(e.state.items[ENERGY_ITEM_IDS.common]).toBe(toStoredEnergy(600));

    const r = debug(e.state, 'items.grant', { itemId: 'cook-bait-night', count: 3 });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.items['cook-bait-night']).toBe(3);

    expect(debug(seed(), 'items.grant', { itemId: 'nope', count: 1 })).toEqual({ ok: false, error: 'bad-request' });
  });

  it('cooking.finish는 진행 중인 조리를 즉시 완료해 보관함으로 옮긴다', () => {
    const cookingState = seed({
      cooking: { recipe: 'cook-lunch-bite', count: 2, bonus: [true, false], startedAt: '2026-10-16T03:00:00.000Z' },
    });
    const out = debug(cookingState, 'cooking.finish', {});
    if (!out.ok) throw new Error(out.error);
    expect(out.state.cooking).toBeNull();
    expect(out.state.items['cook-lunch-bite']).toBe(3);
  });

  it('artifact.set은 보유·레벨(0=회수, 1..5=레벨)을 설정하고 전설 유물은 레벨 맵에 남기지 않는다', () => {
    const all = debug(seed(), 'artifact.set', { artifact: 'all', level: 5 });
    if (!all.ok) throw new Error(all.error);
    expect(all.state.artifacts).toHaveLength(8);
    expect(all.state.artifactLevels?.['wreck-compass']).toBe(5);
    expect(all.state.artifactLevels?.['mami-wata-mirror']).toBeUndefined();

    const removed = debug(all.state, 'artifact.set', { artifact: 'wreck-compass', level: 0 });
    if (!removed.ok) throw new Error(removed.error);
    expect(removed.state.artifacts).not.toContain('wreck-compass');
    expect(removed.state.artifactLevels?.['wreck-compass']).toBeUndefined();
    expect(removed.state.achievements['artifact-all']).toBeUndefined();
  });

  it('hat.set은 모자를 해금/회수하고 회수 시 착용 중인 모자도 벗긴다', () => {
    const unlocked = debug(seed(), 'hat.set', { hat: 'all', owned: true });
    if (!unlocked.ok) throw new Error(unlocked.error);
    expect(unlocked.state.hats).toHaveLength(HATS.length);

    const worn = { ...unlocked.state, look: { ...unlocked.state.look, hat: 'cap-red' } };
    const removed = debug(worn, 'hat.set', { hat: 'cap-red', owned: false });
    if (!removed.ok) throw new Error(removed.error);
    expect(removed.state.hats).not.toContain('cap-red');
    expect(removed.state.look.hat).toBeNull();
  });
});

describe('achievement.setCounter / resetCounters / evaluate & bag.spawn & snapshot.restore', () => {
  it('카운터를 설정하면 누적 보너스가 즉시 반영되고 resetCounters로 초기화한다', () => {
    const set = debug(seed({ achievements: { 'spot-basic-sea': 'claimable' } }), 'achievement.setCounter', { key: 'sell.gold', value: 1_000_000_000 });
    if (!set.ok) throw new Error(set.error);
    expect(set.state.achievementCounters['sell.gold']).toBe(1_000_000_000);
    expect(achievementBonusesOf(set.state).moveSpeed).toBeGreaterThan(0);

    const reset = debug(set.state, 'achievement.resetCounters', { resetAchievements: true });
    if (!reset.ok) throw new Error(reset.error);
    expect(reset.state.achievementCounters).toEqual({});
    expect(reset.state.achievements).toEqual({});
    const filledSea = debug(seed(), 'dex.fill', { zone: 'pacific', form: 'normal' });
    if (!filledSea.ok) throw new Error(filledSea.error);
    expect(filledSea.state.achievements['spot-basic-sea']).toBe('claimable');
    const resetWithDex = debug(filledSea.state, 'achievement.resetCounters', { resetAchievements: true });
    if (!resetWithDex.ok) throw new Error(resetWithDex.error);
    expect(resetWithDex.state.achievements).toEqual({});
    expect(resetWithDex.events.some(e => e.type === 'unlockAchievement')).toBe(false);
  });

  it('achievement.evaluate로 특정 업적 상태 지정 및 재평가가 동작한다', () => {
    const s = debug(seed(), 'achievement.evaluate', { id: 'spot-basic-sea', status: 'claimed' });
    if (!s.ok) throw new Error(s.error);
    expect(s.state.achievements['spot-basic-sea']).toBe('claimed');
  });

  it('achievement.evaluate reset은 도감 조건이 채워져 있어도 같은 턴에 다시 claimable로 덮어쓰지 않는다', () => {
    const filled = debug(seed(), 'dex.completeZone', { zone: 'pacific' });
    if (!filled.ok) throw new Error(filled.error);
    expect(filled.state.achievements['spot-basic-sea']).toBe('claimable');
    expect(filled.state.achievements['spot-full-sea']).toBe('claimable');

    const resetOne = debug(filled.state, 'achievement.evaluate', { id: 'spot-basic-sea', status: 'reset' });
    if (!resetOne.ok) throw new Error(resetOne.error);
    expect(resetOne.state.achievements['spot-basic-sea']).toBeUndefined();
    expect(resetOne.state.achievements['spot-full-sea']).toBe('claimable');
    expect(resetOne.events.some(e => e.type === 'unlockAchievement')).toBe(false);

    const resetAll = debug(filled.state, 'achievement.evaluate', { id: 'all', status: 'reset' });
    if (!resetAll.ok) throw new Error(resetAll.error);
    expect(resetAll.state.achievements).toEqual({});
    expect(resetAll.events.some(e => e.type === 'unlockAchievement')).toBe(false);
  });

  it('bag.spawn은 지정 어종·폼·대어 크기 개체를 가방에 추가한다', () => {
    let n = 0;
    const out = debug(seed(), 'bag.spawn', { fishId: 'vanishingpoint', form: 'variant', big: true, count: 2 }, { newUid: () => `sp-${++n}` });
    if (!out.ok) throw new Error(out.error);
    expect(out.state.bag).toHaveLength(2);
    expect(out.state.bag[0]).toMatchObject({ uid: 'sp-1', fishId: 'vanishingpoint', form: 'variant' });
    expect(isBigSize(fishById('vanishingpoint')!, out.state.bag[0].size!)).toBe(true);
  });

  it('snapshot.restore는 스냅샷으로 상태를 복원하고 빠진 도감을 recordsRemoved로 표시하며 감사 이벤트는 요약만 남긴다', () => {
    const uid1 = '00000000-0000-4000-8000-000000000001';
    const uid2 = '00000000-0000-4000-8000-000000000002';
    const prev = seed({
      gold: 999,
      dex: { crucian: { normal: { count: 2, maxSize: 20, first: '2026-10-01' } } },
      clearedNamed: ['pacific-named-megalodon'],
      achievementCounters: { 'sell.gold': 500 },
    });
    const snap = seed({
      gold: 10,
      bag: [{ uid: uid1, fishId: 'carp', form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked: false }],
      exhibit: [{ uid: uid2, fishId: 'carp', form: 'variant', size: 22, caughtAt: null, spot: null, judgment: null, locked: true }],
      dex: { carp: { normal: { count: 1, maxSize: 30, first: '2026-10-02' } } },
      clearedNamed: ['seasia-named-leviathan'],
      achievementCounters: { 'catch.auto': 3 },
    });
    const out = debug(prev, 'snapshot.restore', { snapshot: snap });
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(10);
    expect(out.state.dex.crucian).toBeUndefined();
    expect(out.state.dex.carp?.normal?.count).toBe(1);
    expect(out.state.clearedNamed).toEqual(['seasia-named-leviathan']);
    expect(out.state.achievementCounters).toEqual({ 'catch.auto': 3 });
    expect(out.writes.recordsRemoved).toEqual([{ fishId: 'crucian', form: 'normal' }]);
    expect(out.events[0]).toEqual({
      type: 'debug', payload: { command: 'snapshot.restore', bagCount: 1, exhibitCount: 1, dexCount: 1 },
    });
  });

  it('snapshot.restore는 비-UUID uid, 중복 uid, 비정상 스칼라, 과대 배열을 bad-request로 거부한다', () => {
    const validUid = '00000000-0000-4000-8000-000000000001';
    const makeInst = (uid: string) => ({
      uid, fishId: 'carp', form: 'normal' as const, size: 20, caughtAt: null, spot: null, judgment: null, locked: false,
    });
    // 비-UUID uid (가방 / 전시대)
    expect(debug(seed(), 'snapshot.restore', { snapshot: { bag: [makeInst('not-a-uuid')] } }))
      .toEqual({ ok: false, error: 'bad-request' });
    expect(debug(seed(), 'snapshot.restore', { snapshot: { exhibit: [null, makeInst('short')] } }))
      .toEqual({ ok: false, error: 'bad-request' });
    // 중복 uid (가방 내 중복, 가방-전시대 간 대소문자 무시 중복)
    expect(debug(seed(), 'snapshot.restore', { snapshot: { bag: [makeInst(validUid), makeInst(validUid)] } }))
      .toEqual({ ok: false, error: 'bad-request' });
    expect(debug(seed(), 'snapshot.restore', {
      snapshot: { bag: [makeInst(validUid)], exhibit: [makeInst(validUid.toUpperCase())] },
    })).toEqual({ ok: false, error: 'bad-request' });
    // 비정상 스칼라
    for (const bad of [
      { gold: Number.NaN },
      { gold: -1 },
      { gold: 1.5 },
      { fame: Number.POSITIVE_INFINITY },
      { fame: -10 },
      { boat: -1 },
      { boat: 99 },
      { rod: 0 },
      { rod: 2.5 },
      { gold: '100' },
    ]) {
      expect(debug(seed(), 'snapshot.restore', { snapshot: bad })).toEqual({ ok: false, error: 'bad-request' });
    }
    // 과대 배열 (10,000 초과)
    const over = Array.from({ length: 10_001 }, () => null);
    expect(debug(seed(), 'snapshot.restore', { snapshot: { exhibit: over } }))
      .toEqual({ ok: false, error: 'bad-request' });
    expect(debug(seed(), 'snapshot.restore', { snapshot: { bag: over } }))
      .toEqual({ ok: false, error: 'bad-request' });
  });
});

describe('bounty.grantMaterial', () => {
  it('고른 유물의 교환 재료를 1개 준다', () => {
    const out = debug(seed(), 'bounty.grantMaterial', { artifact: 'wreck-compass' });
    if (!out.ok) throw new Error(out.error);
    expect(out.state.items[artifactById('wreck-compass')!.materialId]).toBe(1);
  });

  it('같은 구역의 두 번째 유물(바깥섬의 봉돌) 재료도 받을 수 있다', () => {
    const out = debug(seed(), 'bounty.grantMaterial', { artifact: 'outer-isle-sinker' });
    if (!out.ok) throw new Error(out.error);
    expect(out.state.items[artifactById('outer-isle-sinker')!.materialId]).toBe(1);
    expect(Object.keys(out.state.items)).toHaveLength(1);
  });

  it('고른 개수만큼 주고 이미 가진 재료에 더한다', () => {
    const out = debug(seed({ items: { 'mat-wreck-compass': 2 } }), 'bounty.grantMaterial', { artifact: 'wreck-compass', count: 5 });
    if (!out.ok) throw new Error(out.error);
    expect(out.state.items[artifactById('wreck-compass')!.materialId]).toBe(7);
  });

  it.each([0, -1, 1.5, '3', null])('개수가 양의 정수가 아니면(%s) bad-request', count => {
    expect(debug(seed(), 'bounty.grantMaterial', { artifact: 'wreck-compass', count })).toEqual({ ok: false, error: 'bad-request' });
  });

  it('bounty.resetToday는 kind(all|general|named)만 허용하고 잘못된 kind는 bad-request를 반환한다', () => {
    for (const kind of [undefined, 'all', 'general', 'named']) {
      expect(debug(seed(), 'bounty.resetToday', kind === undefined ? {} : { kind }).ok).toBe(true);
    }
    expect(debug(seed(), 'bounty.resetToday', { kind: 'invalid' })).toEqual({ ok: false, error: 'bad-request' });
  });

  it('debugBatch는 여러 명령을 순서대로 원자 적용하고 중간 실패 시 전체를 거부한다', () => {
    const out = applyAction(seed(), {
      type: 'debugBatch',
      steps: [
        { command: 'stats.set', args: { gold: 5000, boat: 9, rod: 65 } },
        { command: 'dex.fill', args: { zone: 'northatlantic', form: 'both', big: true, includeNamed: true } },
        { command: 'artifact.set', args: { artifact: 'all', level: 5 } },
      ],
    }, deps);
    if (!out.ok) throw new Error(out.error);
    expect(out.state.gold).toBe(5000);
    expect(out.state.dex.guabancex?.normal?.count).toBe(1);
    expect(out.state.artifacts).toHaveLength(8);
    expect(out.events.filter(e => e.type === 'debug')).toHaveLength(3);

    const failed = applyAction(seed({ gold: 10 }), {
      type: 'debugBatch',
      steps: [
        { command: 'stats.set', args: { gold: 999 } },
        { command: 'stats.set', args: { boat: 999 } },
      ],
    }, deps);
    expect(failed).toEqual({ ok: false, error: 'bad-request' });
  });
});

describe('catch forcePhase (요청 단위 낮/밤 강제 전환)', () => {
  const dayISO = '2026-10-16T03:25:00.000Z';   // 분 25 = 낮
  const nightISO = '2026-10-16T03:55:00.000Z'; // 분 55 = 밤

  it('수동·방치(auto) 모두 forcePhase를 따라 시간대 풀을 전환한다', () => {
    const s = seed({ boat: 9, rod: 65 });
    const pz = powerZones(s, 'bermuda');
    for (const j of ['normal', 'auto'] as const) {
      expect(prepareCatchDraw(s, j, dayISO, pz, 'night').phaseOpts.phase).toBe('night');
      expect(prepareCatchDraw(s, j, nightISO, pz, 'day').phaseOpts.phase).toBe('day');
    }
  });

  it('낮 시각에 forcePhase=night로 방치 캐치 시 밤 전용 어종을 뽑을 수 있다', () => {
    // 버뮤다 삼각지대(bermuda)의 밤 전용 어종 포함 추첨 확인 (rng=0.999로 풀 뒤쪽 밤 어종 유도)
    const s = seed({ boat: 9, rod: 65 });
    const out = applyAction(s, { type: 'catch', spot: 'bermuda', judgment: 'auto', forcePhase: 'night' }, {
      ...deps,
      now: dayISO,
      rng: () => 0.999999,
    });
    if (!out.ok) throw new Error(out.error);
    expect(out.result.type).toBe('catch');
    if (out.result.type === 'catch') {
      expect(fishById(out.result.fishId)?.night).toBe(true);
    }
  });
});
