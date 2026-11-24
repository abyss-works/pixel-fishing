// 개발 도구 20개 debug 명령 + debugBatch + debugSnapshot + 페이싱 면제의 실제 Postgres 영속화 및 재로딩 일치 회귀 테스트.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { artifactById } from '../src/game/content/artifacts.js';
import { ENERGY_ITEM_IDS, toStoredEnergy } from '../src/game/content/cooking.js';
import { FISH } from '../src/game/content/fish.js';
import { NAMED } from '../src/game/content/named.js';
import { HATS } from '../src/game/content/wardrobe.js';
import { DEBUG_COMMAND_IDS } from '../src/game/rules/debug.js';
import { newState } from '../src/game/rules/logic.js';
import type { GameState } from '../src/game/rules/logic.js';
import { gameDayStartISO, previousGameDayISO } from '../src/game/rules/time.js';
import { database } from './_db/client.js';
import { readSnapshotBounty } from './_data/bounty.js';
import { readOwnBounty, readOwnState } from './_data/me.js';
import {
  callAction, captureRealClock, fish, seedUser, seededRandom, startActionEnv, testUid, userToken,
} from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';

const NOW = '2030-03-04T05:06:07.000Z';
let env: ActionEnv;
let nextUid = 900;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});
beforeEach(() => {
  captureRealClock(() => performance.timeOrigin + performance.now());
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(77));
  process.env.DEPLOY_ENV = 'local';
  return () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env.DEPLOY_ENV = 'local';
  };
});

async function seed(opts: SeedOptions = {}): Promise<string> {
  const uid = testUid(nextUid++);
  return seedUser(env.client, { uid, email: `debug-${nextUid}@example.test`, ...opts });
}

describe('debug 페이싱 면제 & 운영 차단', () => {
  it('debug/debugBatch/debugSnapshot 및 승인된 강제 조우·시간대 캐치는 0ms 연속 호출에도 429가 나지 않는다', async () => {
    const uid = await seed({ state: { boat: 9, rod: 65, location: { kind: 'base', id: 'harbor' } } });
    const recent = new Date(Date.parse(NOW) - 10).toISOString();
    await env.client.query(`update public.saves_current set updated_at = $2, last_catch_at = $2 where user_id = $1`, [uid, recent]);

    const r1 = await callAction(userToken(uid), { type: 'debug', command: 'stats.set', args: { gold: 100 } });
    expect(r1.status).toBe(200);
    const r2 = await callAction(userToken(uid), {
      type: 'debugBatch',
      steps: [{ command: 'stats.set', args: { gold: 200 } }, { command: 'items.grant', args: { itemId: 'cook-bait-night', count: 2 } }],
    });
    expect(r2.status).toBe(200);
    const r3 = await callAction(userToken(uid), { type: 'debugSnapshot' });
    expect(r3.status).toBe(200);
    const r4 = await callAction(userToken(uid), {
      type: 'catch', spot: 'sea', judgment: 'normal', forceEncounter: true, forcePhase: 'night',
    });
    expect(r4.status).toBe(200);
  });

  it('production에서는 debug/debugBatch/debugSnapshot을 422로 차단하고 강제 표시는 떼어 일반 페이싱을 적용한다', async () => {
    process.env.DEPLOY_ENV = 'production';
    const uid = await seed({ state: {}, admin: true });
    const recent = new Date(Date.parse(NOW) - 10).toISOString();
    await env.client.query(`update public.saves_current set updated_at = $2 where user_id = $1`, [uid, recent]);

    for (const action of [
      { type: 'debug', command: 'stats.set', args: { gold: 100 } },
      { type: 'debugBatch', steps: [{ command: 'stats.set', args: { gold: 100 } }] },
      { type: 'debugSnapshot' },
    ]) {
      const res = await callAction(userToken(uid), action);
      expect(res).toMatchObject({ status: 422, body: { error: 'debug-forbidden' } });
    }
    const catchRes = await callAction(userToken(uid), {
      type: 'catch', spot: 'pond', judgment: 'normal', forceEncounter: true, forcePhase: 'night',
    });
    expect(catchRes).toMatchObject({ status: 429, body: { error: 'too-fast' } });
  });
});

describe('20개 debug 명령 전수 DB 영속화 및 재로딩 일치', () => {
  it('20개 전 debug 명령이 DB 테이블에 정확히 영속화되고 readOwnState로 재로딩 시 일치한다', async () => {
    const uid = await seed({
      state: {
        cooking: { recipe: 'cook-lunch-bite', count: 2, bonus: [false, true], startedAt: NOW },
        location: { kind: 'base', id: 'harbor' },
      },
    });
    const { db } = database();
    const call = (command: string, args?: Record<string, unknown>) =>
      callAction(userToken(uid), { type: 'debug', command, args });
    const curData = async () => (await readOwnState(db, uid)).cur!.data as GameState;
    const executed = new Set<string>();

    // 1. stats.set
    executed.add('stats.set');
    expect((await call('stats.set', { gold: 50000, fame: 1000000, boat: 9, rod: 65 })).status).toBe(200);

    // 2. items.grant
    executed.add('items.grant');
    expect((await call('items.grant', { itemId: ENERGY_ITEM_IDS.common, count: 15 })).status).toBe(200);

    // 3. cooking.finish
    executed.add('cooking.finish');
    expect((await call('cooking.finish')).status).toBe(200);

    // 4. bag.spawn
    executed.add('bag.spawn');
    expect((await call('bag.spawn', { fishId: 'carp', form: 'variant', big: true, count: 2 })).status).toBe(200);

    // 5. bounty.grantMaterial
    executed.add('bounty.grantMaterial');
    expect((await call('bounty.grantMaterial', { artifact: 'wreck-compass', count: 3 })).status).toBe(200);

    // 6. dex.completeZone
    executed.add('dex.completeZone');
    expect((await call('dex.completeZone', { zone: 'pacific' })).status).toBe(200);

    // 7. dex.fill (includeNamed: true — 일반·변이·네임드 모두 records에 채우며 오늘 한도 비소모)
    executed.add('dex.fill');
    expect((await call('dex.fill', { zone: 'northatlantic', form: 'both', big: true, includeNamed: true })).status).toBe(200);

    // 8. named.unlock (기본값: 오늘 일일 한도 비소모)
    executed.add('named.unlock');
    expect((await call('named.unlock', { namedId: 'leviathan' })).status).toBe(200);

    let stateNow = await readOwnState(db, uid);
    expect(Number(stateNow.cur?.gold)).toBe(50000);
    expect(stateNow.cur?.boat).toBe(9);
    expect(stateNow.cur?.rod).toBe(65);
    const savedItems = (stateNow.cur!.data as GameState).items;
    expect(savedItems[ENERGY_ITEM_IDS.common]).toBe(toStoredEnergy(15));
    expect(savedItems['cook-lunch-bite']).toBe(3);
    expect(savedItems['mat-wreck-compass']).toBe(3);
    expect(stateNow.instances).toHaveLength(2);
    expect(stateNow.records.some(r => r.fish_id === 'guabancex' && r.form === 'normal')).toBe(true);
    expect(stateNow.records.some(r => r.fish_id === 'leviathan' && r.form === 'normal')).toBe(true);
    expect(stateNow.clearedNamed).toContain('seasia-named-leviathan');
    const bountyBeforeCap = await readOwnBounty(db, uid, gameDayStartISO(NOW));
    expect(bountyBeforeCap.clears).toEqual([]); // 일일 한도 비소모

    // 9. artifact.set (전부 Lv5 → 0으로 회수 시 artifact-all claimable 회수)
    executed.add('artifact.set');
    expect((await call('artifact.set', { artifact: 'all', level: 5 })).status).toBe(200);
    expect((await curData()).achievements['artifact-all']).toBe('claimable');
    expect((await call('artifact.set', { artifact: 'wreck-compass', level: 0 })).status).toBe(200);
    expect((await curData()).achievements['artifact-all']).toBeUndefined();

    // 10. hat.set (전체 해금 → 하나 회수)
    executed.add('hat.set');
    expect((await call('hat.set', { hat: 'all', owned: true })).status).toBe(200);
    expect((await curData()).hats).toHaveLength(HATS.length);
    expect((await call('hat.set', { hat: HATS[0].id, owned: false })).status).toBe(200);
    expect((await curData()).hats).not.toContain(HATS[0].id);

    // 11. achievement.setCounter
    executed.add('achievement.setCounter');
    expect((await call('achievement.setCounter', { key: 'sell.gold', value: 123456 })).status).toBe(200);
    expect((await readOwnState(db, uid)).counters['sell.gold']).toBe(123456);

    // 12. achievement.resetCounters (도감이 채워져 있어도 resetAchievements=true 시 claimable로 되돌리지 않고 DB에 {}를 영속화)
    executed.add('achievement.resetCounters');
    const resetRes = await call('achievement.resetCounters', { resetAchievements: true });
    expect(resetRes.status).toBe(200);
    expect((resetRes.body as { patch: { scalars: GameState } }).patch.scalars.achievements).toEqual({});
    stateNow = await readOwnState(db, uid);
    expect(stateNow.counters).toEqual({});
    const persistedAchievements = (await env.client.query<{ achievements: unknown }>(
      `select data->'achievements' as achievements from public.saves_current where user_id = $1`, [uid],
    )).rows[0].achievements;
    expect(persistedAchievements).toEqual({});

    // 13. achievement.evaluate
    executed.add('achievement.evaluate');
    expect((await call('achievement.evaluate', { id: 'spot-basic-sea', status: 'claimed' })).status).toBe(200);
    expect((await curData()).achievements['spot-basic-sea']).toBe('claimed');

    // 14. named.reset
    executed.add('named.reset');
    expect((await call('named.reset', { namedId: 'leviathan' })).status).toBe(200);
    stateNow = await readOwnState(db, uid);
    expect(stateNow.clearedNamed).not.toContain('seasia-named-leviathan');
    expect(stateNow.records.some(r => r.fish_id === 'leviathan')).toBe(false);

    // 15. dex.reset
    executed.add('dex.reset');
    expect((await call('dex.reset', { zone: 'northatlantic', includeNamed: true })).status).toBe(200);
    stateNow = await readOwnState(db, uid);
    expect(stateNow.records.some(r => r.fish_id === 'guabancex')).toBe(false);
    expect(stateNow.clearedNamed).not.toContain('northatlantic-named-guabancex');

    // 스냅샷용 수배 행 시딩 (어제 네임드 1 + 오늘 일반 1 + 오늘 네임드 1 + 진행 1 + 도전권 1)
    const yesterdayISO = previousGameDayISO(NOW);
    await env.client.query(`insert into public.bounty_clears (user_id, kind, quest_id, cleared_at) values
      ($1, 'named', 'pacific-named-megalodon', $2),
      ($1, 'general', 'pacific-easy-common', $3),
      ($1, 'named', 'seasia-named-leviathan', $3)`, [uid, yesterdayISO, NOW]);
    await env.client.query(`insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at, updated_at)
      values ($1, 'pacific', 'pacific-normal-common', 42, $2, $2)`, [uid, NOW]);
    await env.client.query(`insert into public.bounty_tickets (user_id, quest_id, issued_at)
      values ($1, 'pacific-named-megalodon', $2)`, [uid, NOW]);

    // debugSnapshot으로 스냅샷 캡처
    const snapRes = await callAction(userToken(uid), { type: 'debugSnapshot' });
    expect(snapRes.status).toBe(200);
    const capturedBounty = (snapRes.body as { result: { bounty: unknown } }).result.bounty;
    const savedStateSnapshot: GameState = {
      ...newState(),
      gold: 7777,
      bag: [fish('crucian')],
      dex: { crucian: { normal: { count: 3, maxSize: 25, first: '2026-10-01' } } },
      items: { [artifactById('wreck-compass')!.materialId]: 2 },
      achievementCounters: { 'catch.perfect': 9 },
      clearedNamed: ['pacific-named-megalodon', 'seasia-named-leviathan'],
    };

    // 16. bounty.expireTickets
    executed.add('bounty.expireTickets');
    expect((await call('bounty.expireTickets')).status).toBe(200);
    expect(Date.parse((await readSnapshotBounty(db, uid)).tickets[0].issuedAt)).toBeLessThan(Date.parse(gameDayStartISO(NOW)));

    // 17. bounty.clearTickets
    executed.add('bounty.clearTickets');
    expect((await call('bounty.clearTickets')).status).toBe(200);
    expect((await readSnapshotBounty(db, uid)).tickets).toEqual([]);

    // 18. bounty.clearProgress
    executed.add('bounty.clearProgress');
    expect((await call('bounty.clearProgress')).status).toBe(200);
    expect((await readSnapshotBounty(db, uid)).progress).toEqual([]);

    // 19. bounty.resetToday (kind='named' 시 오늘 네임드만 지우고 어제 네임드는 유지하며 응답 clearedNamed가 DB와 즉시 일치)
    executed.add('bounty.resetToday');
    const resetNamedRes = await call('bounty.resetToday', { kind: 'named' });
    expect(resetNamedRes.status).toBe(200);
    const resetScalars = (resetNamedRes.body as { patch: { scalars: { clearedNamed: string[] } } }).patch.scalars;
    expect(resetScalars.clearedNamed).toEqual(['pacific-named-megalodon']);
    expect((await readOwnState(db, uid)).clearedNamed).toEqual(['pacific-named-megalodon']);
    const afterNamedResetBounty = await readSnapshotBounty(db, uid);
    expect(afterNamedResetBounty.clears.some(c => c.kind === 'general')).toBe(true);

    // 20. snapshot.restore (수배 행 전체를 원본 시각 그대로 복원)
    executed.add('snapshot.restore');
    expect((await call('snapshot.restore', { snapshot: savedStateSnapshot, bounty: capturedBounty })).status).toBe(200);
    const reloadedState = await readOwnState(db, uid);
    const reloadedBounty = await readSnapshotBounty(db, uid);
    expect(Number(reloadedState.cur?.gold)).toBe(7777);
    expect(reloadedState.instances).toHaveLength(1);
    expect(reloadedState.counters).toEqual({ 'catch.perfect': 9 });
    expect(reloadedState.clearedNamed.sort()).toEqual(['pacific-named-megalodon', 'seasia-named-leviathan']);
    expect(reloadedBounty.progress).toHaveLength(1);
    expect(reloadedBounty.tickets).toHaveLength(1);
    expect(reloadedBounty.clears.some(c => c.kind === 'general' && c.questId === 'pacific-easy-common')).toBe(true);

    // 구 포맷 스냅샷(bounty 미포함) 복원 시에도 과거 네임드를 오늘 시각으로 덮어쓰지 않으며, 기존 general 클리어는 보존된다
    expect((await call('snapshot.restore', { snapshot: savedStateSnapshot })).status).toBe(200);
    const legacyBounty = await readOwnBounty(db, uid, gameDayStartISO(NOW));
    expect(legacyBounty.clears.filter(c => c.kind === 'named')).toEqual([]);
    expect(legacyBounty.clears).toEqual([{ kind: 'general', cleared_at: expect.any(String) }]);
    expect((await readOwnState(db, uid)).clearedNamed.sort()).toEqual(['pacific-named-megalodon', 'seasia-named-leviathan']);

    // 20개 전 명령 누락 없이 검증됨을 확인
    expect([...executed].sort()).toEqual([...DEBUG_COMMAND_IDS].sort());
  });

  it('debugBatch는 단일 트랜잭션으로 모든 테이블을 원자 영속화하고 중간 오류 시 전체 롤백한다', async () => {
    const uid = await seed({ state: { gold: 100 } });
    const { db } = database();
    await env.client.query(`insert into public.bounty_clears (user_id, kind, quest_id, cleared_at)
      values ($1, 'named', 'pacific-named-megalodon', $2)`, [uid, NOW]);

    const badBatch = await callAction(userToken(uid), {
      type: 'debugBatch',
      steps: [
        { command: 'stats.set', args: { gold: 9999 } },
        { command: 'stats.set', args: { boat: 999 } },
      ],
    });
    expect(badBatch.status).toBe(422);
    expect(Number((await readOwnState(db, uid)).cur?.gold)).toBe(100);

    const okBatch = await callAction(userToken(uid), {
      type: 'debugBatch',
      steps: [
        { command: 'bounty.resetToday', args: { kind: 'all' } },
        { command: 'stats.set', args: { gold: 500000, boat: 9, rod: 65 } },
        { command: 'dex.fill', args: { zone: 'all', form: 'both', big: true, includeNamed: true } },
        { command: 'achievement.setCounter', args: { key: 'sell.gold', value: 4200 } },
      ],
    });
    expect(okBatch.status).toBe(200);

    const loaded = await readOwnState(db, uid);
    expect(Number(loaded.cur?.gold)).toBe(500000);
    expect(loaded.records.length).toBeGreaterThanOrEqual(FISH.length * 2 + NAMED.length);
    expect(loaded.clearedNamed).toHaveLength(NAMED.length);
    expect(loaded.counters).toEqual({ 'sell.gold': 4200 });
    expect((await readOwnBounty(db, uid, gameDayStartISO(NOW))).clears).toEqual([]);
  });
});
