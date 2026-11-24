// 토글식 자동 잠금 실제 DB 통합 테스트 — fastCatch 경로의 자동 교체, 수동 보호, 가방 초과 선행 판정,
// 재시작 유지, 풀 경로 동등성, 추가 DB 왕복 0회를 실제 Postgres로 검증한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_ENERGY_BOAT, ENERGY_ITEM_IDS, ENERGY_PER_INDIVIDUAL } from '../src/game/content/cooking.js';
import { FISH } from '../src/game/content/fish.js';
import { SNAPSHOT_EVERY } from '../src/game/rules/balance.js';
import { endedFirstCatch } from '../src/game/rules/firstCatch.js';
import type { DailyFortune } from '../src/game/rules/fortune.js';
import { WALK_BAG_CAP, autoLockKey, capOfBoat } from '../src/game/rules/logic.js';
import type { GameState } from '../src/game/rules/logic.js';
import type { ActionResult, StatePatch } from '../src/game/rules/actions.js';
import { gameDayOf } from '../src/game/rules/time.js';
import { database } from './_db/client.js';
import { catchLookup } from './_data/load.js';
import {
  callAction, captureRealClock, fish, seedUser, seededRandom,
  startActionEnv, testUid, userToken,
} from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';

const NOW = '2030-03-04T05:06:07.000Z';
// 오늘의 운세가 catch RNG를 소모하거나 희귀·네임드 가중치를 바꾸지 않도록 판매 보너스만 있는 고정 운세를 시딩한다
const TEST_FORTUNE: DailyFortune = { day: gameDayOf(NOW), kind: 'gold', index: 3 };
let env: ActionEnv;
let nextUid = 1000;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});
beforeEach(() => {
  captureRealClock(() => performance.timeOrigin + performance.now());
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
  return () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env.DEPLOY_ENV = 'local';
  };
});

async function seed(opts: SeedOptions = {}): Promise<string> {
  const uid = testUid(nextUid++);
  const state = opts.state ? { ...opts.state, fortune: opts.state.fortune ?? TEST_FORTUNE } : undefined;
  return seedUser(env.client, { uid, email: `autolock-${nextUid}@example.test`, ...opts, ...(state ? { state } : {}) });
}

interface ActionOkBody { patch: StatePatch; result: ActionResult }

async function readInstances(uid: string) {
  const { rows } = await env.client.query<{ uid: string; fish_id: string; form: string; size: number | null; locked: boolean }>(
    'select uid, fish_id, form, size, locked from public.fish_instances where user_id = $1 and slot is null', [uid]);
  return rows;
}

async function readBlob(uid: string) {
  const { rows } = await env.client.query<{ data: Partial<GameState> }>(
    'select data from public.saves_current where user_id = $1', [uid]);
  return rows[0].data;
}

async function readEventTypes(uid: string) {
  const { rows } = await env.client.query<{ type: string }>(
    'select type from public.events where user_id = $1 order by id asc', [uid]);
  return rows.map(r => r.type);
}

/** seededRandom(42) 기준으로 연못 normal 1회 캐치가 잡는 어종·폼·크기를 미리 측정한다 */
async function probePondCatch(): Promise<{ fishId: string; form: 'normal' | 'variant'; size: number }> {
  const uid = await seed({ state: {} });
  const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'normal' });
  expect(res.status).toBe(200);
  const body = res.body as ActionOkBody;
  if (body.result.type !== 'catch') throw new Error('expected catch result');
  return { fishId: body.result.fishId, form: body.result.info.form, size: body.result.info.size };
}

describe('토글식 자동 잠금 (DB / fastCatch)', () => {
  it('setAutoLockOnCatch — 게스트 허용, 서버 저장, 감사 이벤트 없음, 기존 가방 무변경', async () => {
    const existing = fish('carp', { size: 40, locked: false });
    const uid = await seed({ email: null, state: { bag: [existing] } });

    const on = await callAction(userToken(uid), { type: 'setAutoLockOnCatch', on: true });
    expect(on.status).toBe(200);
    expect((on.body as ActionOkBody).patch.scalars.autoLockOnCatch).toBe(true);
    expect((await readBlob(uid)).autoLockOnCatch).toBe(true);
    expect((await readInstances(uid))[0].locked).toBe(false);
    expect(await readEventTypes(uid)).toEqual([]);

    vi.setSystemTime(Date.parse(NOW) + 2000);
    const off = await callAction(userToken(uid), { type: 'setAutoLockOnCatch', on: false });
    expect(off.status).toBe(200);
    expect((await readBlob(uid)).autoLockOnCatch).toBe(false);
    expect(await readEventTypes(uid)).toEqual([]);
  });

  it('fastCatch — 자동 잠금, 더 큰 개체 교체, 재시작(재조회) 후 유지, 수동 잠금 보호', async () => {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const target = await probePondCatch();

    // 1) 기존 자동 잠금(1cm)이 있는 상태에서 더 큰 개체를 잡으면 자동 교체된다
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const prevAuto = fish(target.fishId, { form: target.form, size: 1, locked: true });
    const key = autoLockKey(target.fishId, target.form);
    const uid = await seed({
      state: { autoLockOnCatch: true, bag: [prevAuto], autoLockedIds: { [key]: prevAuto.uid } },
    });

    const caught = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'normal' });
    expect(caught.status).toBe(200);
    const body = caught.body as ActionOkBody;
    if (body.result.type !== 'catch') throw new Error('expected catch');
    const newUid = body.result.uid;
    expect(body.patch.writes.instancesAdded[0].inst.locked).toBe(true);
    expect(body.patch.writes.instancesLocked).toEqual([{ uid: prevAuto.uid, locked: false }]);
    expect(body.patch.scalars.autoLockedIds[key]).toBe(newUid);

    // DB 재조회(재시작 후 유지 확인)
    const rowsAfter = await readInstances(uid);
    expect(rowsAfter.find(r => r.uid === newUid)?.locked).toBe(true);
    expect(rowsAfter.find(r => r.uid === prevAuto.uid)?.locked).toBe(false);
    expect((await readBlob(uid)).autoLockedIds?.[key]).toBe(newUid);

    // 2) 수동 잠금 승격(setLocked true) 후 더 큰 개체가 와도 기존 수동 잠금을 해제하지 않는다
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const manual = fish(target.fishId, { form: target.form, size: 1, locked: true });
    const uidManual = await seed({
      state: { autoLockOnCatch: true, bag: [manual], autoLockedIds: { [key]: manual.uid } },
    });
    const promote = await callAction(userToken(uidManual), { type: 'setLocked', uids: [manual.uid], locked: true });
    expect(promote.status).toBe(200);
    expect((await readBlob(uidManual)).autoLockedIds).toEqual({});

    vi.setSystemTime(Date.parse(NOW) + 20_000);
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const afterPromote = await callAction(userToken(uidManual), { type: 'catch', spot: 'pond', judgment: 'normal' });
    expect(afterPromote.status).toBe(200);
    const body2 = afterPromote.body as ActionOkBody;
    if (body2.result.type !== 'catch') throw new Error('expected catch');
    const caughtUid2 = body2.result.uid;
    expect(body2.patch.writes.instancesLocked).toEqual([]);
    const rowsManual = await readInstances(uidManual);
    expect(rowsManual.find(r => r.uid === manual.uid)?.locked).toBe(true);
    expect(rowsManual.find(r => r.uid === caughtUid2)?.locked).toBe(true);
  });

  it('fastCatch — 가방 초과 시 토글식 자동 잠금이 먼저 적용되어 새 개체는 보호되고 해제된 기존 자동 잠금 개체가 방생된다', async () => {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const target = await probePondCatch();
    const key = autoLockKey(target.fishId, target.form);
    const fillerId = target.fishId === 'carp' ? 'crucian' : 'carp';

    // 1) 가방 60칸: 잠긴 다른 어종 59마리 + 자동 잠금된 target(1cm) 1마리
    //    더 큰 target 포획 -> 새 개체 잠금 보호 + 해제된 prevAuto 초과 방생 (instancesLocked 중복 없음)
    const prevAuto = fish(target.fishId, { form: target.form, size: 1, locked: true });
    const fillers = Array.from({ length: WALK_BAG_CAP - 1 }, () => fish(fillerId, { size: 50, locked: true }));
    const uid = await seed({
      state: { autoLockOnCatch: true, bag: [prevAuto, ...fillers], autoLockedIds: { [key]: prevAuto.uid } },
    });

    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'normal' });
    expect(res.status).toBe(200);
    const body = res.body as ActionOkBody;
    if (body.result.type !== 'catch') throw new Error('expected catch');
    const caughtUid = body.result.uid;
    expect(body.result.released.map(r => r.uid)).toEqual([prevAuto.uid]);
    expect(body.patch.writes.instancesRemoved).toEqual([prevAuto.uid]);
    expect(body.patch.writes.instancesLocked).toEqual([]);
    expect(body.patch.writes.instancesAdded[0].inst.locked).toBe(true);

    const rows = await readInstances(uid);
    expect(rows).toHaveLength(WALK_BAG_CAP);
    expect(rows.some(r => r.uid === prevAuto.uid)).toBe(false);
    expect(rows.find(r => r.uid === caughtUid)?.locked).toBe(true);

    // 2) 가방 60칸: 잠긴 다른 어종 59마리 + 미잠금 1마리 + 잠긴 target 없음 ->
    //    새로 잡힌 일반 어종이 가장 안 특별해도 자동 잠금으로 보호되어 미잠금 개체가 대신 방생된다
    const unlockedFiller = fish(fillerId, { size: 50, locked: false });
    const fillers2 = Array.from({ length: WALK_BAG_CAP - 1 }, () => fish(fillerId, { size: 60, locked: true }));
    const uid2 = await seed({
      state: { autoLockOnCatch: true, bag: [unlockedFiller, ...fillers2] },
    });
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const res2 = await callAction(userToken(uid2), { type: 'catch', spot: 'pond', judgment: 'normal' });
    expect(res2.status).toBe(200);
    const body2 = res2.body as ActionOkBody;
    if (body2.result.type !== 'catch') throw new Error('expected catch');
    expect(body2.result.released.map(r => r.uid)).toEqual([unlockedFiller.uid]);
    expect(body2.patch.writes.instancesAdded[0].inst.locked).toBe(true);
  });

  it('fastCatch — 가공 플랜트선에서 가방 초과로 해제된 기존 자동 잠금 개체는 기운으로 자동 추출된다', async () => {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const target = await probePondCatch();
    const key = autoLockKey(target.fishId, target.form);
    const targetFish = FISH.find(f => f.id === target.fishId)!;
    const fillerId = target.fishId === 'carp' ? 'crucian' : 'carp';
    const cap = capOfBoat(AUTO_ENERGY_BOAT);

    const prevAuto = fish(target.fishId, { form: target.form, size: 1, locked: true });
    const fillers = Array.from({ length: cap - 1 }, () => fish(fillerId, { size: 50, locked: true }));
    const uid = await seed({
      state: {
        boat: AUTO_ENERGY_BOAT,
        autoLockOnCatch: true,
        energyTargets: { [targetFish.spot]: true },
        bag: [prevAuto, ...fillers],
        autoLockedIds: { [key]: prevAuto.uid },
      },
    });

    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'normal' });
    expect(res.status).toBe(200);
    const body = res.body as ActionOkBody;
    if (body.result.type !== 'catch') throw new Error('expected catch');
    expect(body.result.released).toEqual([]);
    expect(body.result.extracted?.map(r => r.uid)).toEqual([prevAuto.uid]);
    expect(body.patch.writes.instancesRemoved).toEqual([prevAuto.uid]);
    expect(body.patch.writes.instancesLocked).toEqual([]);
    expect(body.patch.scalars.items[ENERGY_ITEM_IDS[targetFish.rarity]]).toBe(ENERGY_PER_INDIVIDUAL);
    expect(await readEventTypes(uid)).toContain('autoExtractEnergy');
  });

  it('fastCatch vs 풀 경로(스냅샷 경계) — 동일 시드·상태에서 결과가 완전히 일치한다', async () => {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const target = await probePondCatch();
    const key = autoLockKey(target.fishId, target.form);
    const fillerId = target.fishId === 'carp' ? 'crucian' : 'carp';

    const runAtVersion = async (version: number, idBase: number) => {
      const prevAuto = fish(target.fishId, { uid: testUid(idBase), form: target.form, size: 1, locked: true });
      const fillers = Array.from({ length: WALK_BAG_CAP - 1 }, (_, i) =>
        fish(fillerId, { uid: testUid(idBase + 1 + i), size: 50, locked: true }));
      const uid = await seed({
        version,
        state: { autoLockOnCatch: true, bag: [prevAuto, ...fillers], autoLockedIds: { [key]: prevAuto.uid } },
      });
      vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
      const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'normal' });
      expect(res.status).toBe(200);
      const body = res.body as ActionOkBody;
      const rows = await readInstances(uid);
      const blob = await readBlob(uid);
      return { prevAutoUid: prevAuto.uid, body, rows, blob };
    };

    const fast = await runAtVersion(2, 9500);
    const full = await runAtVersion(SNAPSHOT_EVERY - 1, 9700);

    expect(fast.body.patch.writes.instancesRemoved).toEqual([fast.prevAutoUid]);
    expect(full.body.patch.writes.instancesRemoved).toEqual([full.prevAutoUid]);
    expect(fast.body.patch.writes.instancesLocked).toEqual([]);
    expect(full.body.patch.writes.instancesLocked).toEqual([]);
    expect(fast.body.patch.writes.instancesAdded[0].inst.locked)
      .toBe(full.body.patch.writes.instancesAdded[0].inst.locked);
    expect(fast.rows.filter(r => r.locked)).toHaveLength(full.rows.filter(r => r.locked).length);
    expect(Object.keys(fast.blob.autoLockedIds ?? {})).toEqual(Object.keys(full.blob.autoLockedIds ?? {}));
  });

  it('DB 왕복 수 — autoLockOnCatch 켜짐은 꺼짐과 동일한 DB 쿼리 수(추가 왕복 0회)로 처리한다', async () => {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const target = await probePondCatch();
    const key = autoLockKey(target.fishId, target.form);
    const fillerId = target.fishId === 'carp' ? 'crucian' : 'carp';

    const measure = async (autoLockOnCatch: boolean, bagFull: boolean) => {
      const prevAuto = fish(target.fishId, { form: target.form, size: 1, locked: true });
      const bag = bagFull
        ? [prevAuto, ...Array.from({ length: WALK_BAG_CAP - 1 }, () => fish(fillerId, { size: 50, locked: true }))]
        : [prevAuto];
      const uid = await seed({
        state: {
          autoLockOnCatch,
          bag,
          autoLockedIds: autoLockOnCatch ? { [key]: prevAuto.uid } : {},
        },
      });
      // 캐치 전 database() 초기화를 보장해 execute 스파이를 건다
      const spy = vi.spyOn(database().db, 'execute');
      spy.mockClear();
      vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
      const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'normal' });
      expect(res.status).toBe(200);
      const count = spy.mock.calls.length;
      spy.mockRestore();
      const body = res.body as ActionOkBody;
      if (body.result.type !== 'catch') throw new Error('expected catch');
      expect(body.result.fishId).toBe(target.fishId);
      if (autoLockOnCatch) {
        expect(body.patch.writes.instancesAdded[0].inst.locked).toBe(true);
        if (bagFull) {
          expect(body.patch.writes.instancesRemoved).toEqual([prevAuto.uid]);
          expect(body.patch.writes.instancesLocked).toEqual([]);
        } else {
          expect(body.patch.writes.instancesLocked).toEqual([{ uid: prevAuto.uid, locked: false }]);
        }
      }
      return count;
    };

    // 일반 포획: 꺼짐과 켜짐의 DB 왕복 수가 같다
    const normalOff = await measure(false, false);
    const normalOn = await measure(true, false);
    expect(normalOn).toBe(normalOff);

    // 가방 초과 포획: 꺼짐과 켜짐의 DB 왕복 수가 같다 (해제된 개체 메모리 합류, 재조회 없음)
    const fullOff = await measure(false, true);
    const fullOn = await measure(true, true);
    expect(fullOn).toBe(fullOff);
  });

  it('fastCatch — 비이진 소수(10.45) 동률은 교체하지 않고 유지하며 catchLookup은 float4 최단 소수(number | null)를 돌려준다', async () => {
    // minnow(price=3) 평균 크기 = 10 + 3 * 0.15 = 10.45 (float32 10.449999809265137 < 10.45).
    // u1=1, u2=0 → z=0 → rollSize === 10.45 정확히 동률.
    const lockedTie = fish('minnow', { form: 'normal', size: 10.45, locked: true });
    const key = autoLockKey('minnow', 'normal');
    const uid = await seed({
      state: {
        firstCatch: endedFirstCatch(),
        autoLockOnCatch: true,
        bag: [lockedTie],
        autoLockedIds: { [key]: lockedTie.uid },
      },
    });

    // catchLookup이 float4(real) 최단 소수 10.45를 number 타입으로 돌려주는지 직접 확인
    const looked = await catchLookup(database().db, uid, 'minnow', 'normal', { prevUid: lockedTie.uid });
    expect(typeof looked.maxLockedSize).toBe('number');
    expect(looked.maxLockedSize).toBe(10.45);
    expect(looked.prevAuto?.size).toBe(10.45);

    // 없는 어종은 maxLockedSize === null
    const emptyLookup = await catchLookup(database().db, uid, 'carp', 'normal', { prevUid: null });
    expect(emptyLookup.maxLockedSize).toBeNull();

    // rng 시퀀스: rarity(0→common), fish(0.5→minnow), rollSize u1=1 / u2=0 (→10.45), form(0.9→normal)
    const seq = [0, 0.5, 1, 0, 0.9];
    let idx = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[idx++] ?? 0);

    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'normal' });
    expect(res.status).toBe(200);
    const body = res.body as ActionOkBody;
    if (body.result.type !== 'catch') throw new Error('expected catch');
    expect(body.result.fishId).toBe('minnow');
    expect(body.result.info.form).toBe('normal');
    expect(body.result.info.size).toBe(10.45);

    // 동률이므로 새 개체는 잠기지 않고, 기존 잠금과 autoLockedIds가 그대로 유지된다
    expect(body.patch.writes.instancesAdded[0].inst.locked).toBe(false);
    expect(body.patch.writes.instancesLocked).toEqual([]);
    expect(body.patch.scalars.autoLockedIds[key]).toBe(lockedTie.uid);
    const rows = await readInstances(uid);
    expect(rows.find(r => r.uid === lockedTie.uid)?.locked).toBe(true);
    expect(rows.find(r => r.uid !== lockedTie.uid)?.locked).toBe(false);
  });

  it('fastCatch — 크기 미상(size: null) 잠김 개체가 있을 때 정상 크기가 잡히면 교체된다', async () => {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const target = await probePondCatch();
    const key = autoLockKey(target.fishId, target.form);

    const unsized = fish(target.fishId, { form: target.form, size: null, locked: true });
    const uid = await seed({
      state: {
        autoLockOnCatch: true,
        bag: [unsized],
        autoLockedIds: { [key]: unsized.uid },
      },
    });

    const looked = await catchLookup(database().db, uid, target.fishId, target.form, { prevUid: unsized.uid });
    expect(typeof looked.maxLockedSize).toBe('number');
    expect(looked.maxLockedSize).toBe(-1);

    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'normal' });
    expect(res.status).toBe(200);
    const body = res.body as ActionOkBody;
    if (body.result.type !== 'catch') throw new Error('expected catch');
    const newUid = body.result.uid;

    expect(body.patch.writes.instancesAdded[0].inst.locked).toBe(true);
    expect(body.patch.writes.instancesLocked).toEqual([{ uid: unsized.uid, locked: false }]);
    expect(body.patch.scalars.autoLockedIds[key]).toBe(newUid);
    const rows = await readInstances(uid);
    expect(rows.find(r => r.uid === unsized.uid)?.locked).toBe(false);
    expect(rows.find(r => r.uid === newUid)?.locked).toBe(true);
  });
});
