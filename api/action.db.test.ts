// 액션 엔드포인트 특성 테스트 — 같은 입력에 같은 응답과 같은 DB 상태가 나오는지 실제 Postgres로 고정한다.
// 스냅샷은 데이터 계층 전환 전 구현으로 기록했다. 전환 뒤 구현도 이 스냅샷을 그대로 통과해야 한다.
// 난수는 고정 시드, 시각은 고정된 가짜 시계, uid는 테스트 번호로 고정한다.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { LIVE_PATH } from '../src/game/rules/live.js';
import type { ServerMessage } from '../src/game/rules/live.js';
import { saveChat } from './_data/chat.js';
import { liveIdentity } from './_data/profile.js';
import { attachLive } from './_server/live.js';
import { provideSetNick } from './_server/livePresence.js';
import { achievementById } from '../src/game/content/achievements.js';
import { artifactById, artifactLevelCost } from '../src/game/content/artifacts.js';
import { BOATS } from '../src/game/content/boats.js';
import { BOUNTIES, bountyById, dailyQuestFor, offeredQuestsFor } from '../src/game/content/bounties.js';
import type { BountyZone } from '../src/game/content/bounties.js';
import {
  COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS, ENERGY_PER_INDIVIDUAL, recipeById, recipeCostStored,
} from '../src/game/content/cooking.js';
import { hatById } from '../src/game/content/wardrobe.js';
import { upgradeCost } from '../src/game/rules/balance.js';
import { endedFirstCatch, newFirstCatch } from '../src/game/rules/firstCatch.js';
import { FORTUNE_CATALOG, luckMultOf } from '../src/game/rules/fortune.js';
import type { DailyFortune } from '../src/game/rules/fortune.js';
import { FISH, LICENSE_GRADES, WALK_BAG_CAP, newState, sellSelected, zoneDexMissing } from '../src/game/rules/logic.js';
import type { GameState } from '../src/game/rules/logic.js';
import { NAMED_PITY_CATCHES, PITY_DONE, SPECIES_PITY_K } from '../src/game/rules/pity.js';
import { APP_VERSION } from '../src/version.js';
import { database } from './_db/client.js';
import {
  LOCAL_ORIGIN, callAction, captureRealClock, dumpUser, fish, normalize, seedUser, seededRandom,
  sessionHeaders, startActionEnv, testUid, userToken,
} from './_dbTest/actionHarness.js';
import type { ActionEnv, ActionResponse, SeedOptions } from './_dbTest/actionHarness.js';
import { pendingAfterResponse } from './_dbTest/serverShim.js';

const NOW = '2030-03-04T05:06:07.000Z';
const TODAY_KST = '2030-03-04';
let env: ActionEnv;
let nextUid = 1;

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
  return seedUser(env.client, { uid, email: `user-${nextUid}@example.test`, ...opts });
}

async function snapshotOf(uid: string, res: unknown) {
  return { res: normalize(res, uid), db: await dumpUser(env.client, uid) };
}

/** 사용자를 만들고 액션 하나를 보낸 뒤 응답과 DB 상태를 정규화해 돌려준다 */
async function run(opts: SeedOptions, action: unknown, call: { origin?: string } = {}) {
  const uid = await seed(opts);
  return snapshotOf(uid, await callAction(userToken(uid), action, call));
}

/** 응답 시점을 그대로 보는 호출 — afterResponse에 모인 후속 쓰기는 호출자가 끝내기 전까지 기다리지 않는다 */
async function callActionBeforeFollowUps(token: string, body: unknown): Promise<ActionResponse> {
  const { default: handler } = await import('./action.js');
  const out: ActionResponse = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    end() {},
  };
  await handler({
    method: 'POST',
    headers: { 'x-build-id': 'dev', 'x-client-version': APP_VERSION, ...sessionHeaders(token) },
    body,
  } as never, res as never);
  return out;
}

/** 해역 라이선스 도감 조건을 채운 도감 */
function zoneDex(zone: BountyZone, tier: keyof typeof LICENSE_GRADES): GameState['dex'] {
  const dex: GameState['dex'] = {};
  for (const id of zoneDexMissing(newState(), zone, LICENSE_GRADES[tier])) {
    dex[id] = { normal: { count: 1, maxSize: 30, first: '2026-01-01' } };
  }
  return dex;
}

const ALL_FORTUNE_KINDS = [...new Set(FORTUNE_CATALOG.map(e => e.kind))];
const at = (id: 'home' | 'harbor' | 'colombo' | 'walvisbay'): GameState['location'] => ({ kind: 'base', id });

describe('요청 경계', () => {
  it('GET은 204 워밍 응답이다', async () => {
    expect(await callAction(null, null, { method: 'GET' })).toEqual({ status: 204, body: undefined });
  });

  it('POST 외 메서드는 405다', async () => {
    expect(await callAction(null, null, { method: 'PUT' })).toMatchObject({ status: 405 });
  });

  it('배포 식별자가 다르면 426이다', async () => {
    expect(await callAction(null, { type: 'boot' }, { buildId: 'other' }))
      .toMatchObject({ status: 426, body: { error: 'version-mismatch' } });
  });

  it('토큰이 없으면 401이다', async () => {
    expect(await callAction(null, { type: 'boot' })).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
  });

  it('형식이 틀린 액션은 400이다', async () => {
    expect(await run({ state: {} }, { type: 'nope' })).toMatchSnapshot();
  });

  it('제재 계정은 403이다', async () => {
    expect(await run({ state: {}, restricted: true }, { type: 'boot' })).toMatchSnapshot();
  });

  it('느림 창 대상이 아니면 짧은 간격도 받고, 느림 창 대상은 429다', async () => {
    const recent = new Date(Date.parse(NOW) - 100).toISOString();
    const uid = await seed({ state: { gold: 1_000 }, version: 3, updatedAt: recent });
    expect(await callAction(userToken(uid), { type: 'upgradeRod' })).toMatchObject({ status: 200 });
    // 직전 성공 액션 직후의 sendLetter는 느림 창에 걸려 거부된다
    expect(await callAction(userToken(uid), { type: 'sendLetter', text: '안녕하세요' }))
      .toMatchObject({ status: 429, body: { error: 'too-fast' } });
  });
});

describe('첫 액션', () => {
  it('프로필과 저장 상태가 없는 사용자의 boot는 둘을 만들고 버전 2로 올린다', async () => {
    const out = await run({ nickname: null }, { type: 'boot', buildId: 'dev' });
    const res = out.res as {
      status: number;
      body: {
        result: unknown;
        patch: {
          version: number;
          baseVersion: number;
          scalars: { fortune: DailyFortune | null };
          writes: Record<string, unknown[]>;
        };
      };
    };
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ type: 'boot', schoolDay: TODAY_KST });
    expect(res.body.patch.version).toBe(2);
    expect(res.body.patch.baseVersion).toBe(1);
    expect(res.body.patch.writes).toEqual({
      instancesAdded: [], instancesRemoved: [], instancesMoved: [], instancesLocked: [], records: [],
    });
    expect(out.db.profiles).toHaveLength(1);
    expect(out.db.profiles[0]).toMatchObject({ user_id: '<user>', nickname: expect.any(String) });
    expect(out.db.saves_current).toHaveLength(1);
    const save = out.db.saves_current[0] as {
      version: string; gold: string; fame: string; boat: number; rod: number; data: GameState;
    };
    expect(save).toMatchObject({ version: '2', gold: '0', fame: '0', boat: 0, rod: 1 });
    expect(save.data.v).toBe(10);
    expect(save.data.fortune).toEqual({
      day: TODAY_KST,
      kind: expect.toBeOneOf(ALL_FORTUNE_KINDS),
      index: expect.toBeOneOf([3, 5]),
    });
    expect(res.body.patch.scalars.fortune).toEqual(save.data.fortune);
    expect(out.db.events).toEqual([
      { user_id: '<user>', type: 'boot', payload: { buildId: 'dev' }, created_at: '<now>' },
    ]);
  });

  it('구 saves 행만 있는 사용자는 그 상태로 시딩한다', async () => {
    const uid = await seed();
    await env.client.query('insert into public.saves (user_id, data, updated_at) values ($1, $2, $3)', [uid, {
      v: 8, gold: 500, fame: 20, boat: 0, rod: 2, bag: [fish('crucian'), fish('minnow', { locked: true })],
      exhibit: [], dex: { crucian: { normal: { count: 3, maxSize: 31, first: '2026-01-02' } } },
      coupons: [], location: at('home'), visited: [], artifacts: [], items: {}, activeBait: null,
    }, '2026-01-03T00:00:00.000Z']);
    const out = await snapshotOf(uid, await callAction(userToken(uid), { type: 'boot' }));
    const res = out.res as {
      status: number;
      body: { result: unknown; patch: { version: number; baseVersion: number; scalars: { fortune: DailyFortune | null } } };
    };
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ type: 'boot', schoolDay: TODAY_KST });
    expect(res.body.patch.version).toBe(2);
    expect(res.body.patch.baseVersion).toBe(1);
    const save = out.db.saves_current[0] as {
      version: string; gold: string; fame: string; boat: number; rod: number; data: GameState;
    };
    expect(save).toMatchObject({ version: '2', gold: '500', fame: '20', boat: 0, rod: 2 });
    expect(save.data.v).toBe(10);
    expect(save.data.fortune).toEqual({
      day: TODAY_KST,
      kind: expect.toBeOneOf(ALL_FORTUNE_KINDS),
      index: expect.toBeOneOf([3, 5]),
    });
    expect(res.body.patch.scalars.fortune).toEqual(save.data.fortune);
    expect(out.db.fish_instances).toMatchObject([
      { fish_id: 'crucian', locked: false, slot: null },
      { fish_id: 'minnow', locked: true, slot: null },
    ]);
    expect(out.db.records).toEqual([
      { user_id: '<user>', fish_id: 'crucian', form: 'normal', count: '3', max_size: 31, first_caught: '2026-01-02T00:00:00.000Z', updated_at: '<now>' },
    ]);
    expect(out.db.events).toEqual([
      { user_id: '<user>', type: 'boot', payload: {}, created_at: '<now>' },
    ]);
  });
});

describe('낚시', () => {
  it('통상 캐치는 개체와 도감을 쓰고 명성을 올린다', async () => {
    const out = await run({ state: {} }, { type: 'catch', spot: 'pond', judgment: 'good' });
    expect((out.res as { status: number }).status).toBe(200);
    expect(out.db.fish_instances).toHaveLength(1);
    expect(out.db.records).toHaveLength(1);
    const save = out.db.saves_current[0] as { version: string; fame: string; data: GameState };
    expect(Number(save.version)).toBe(3);
    expect(Number(save.fame)).toBeGreaterThan(0);
    expect(save.data.firstCatch.pond.n).toBe(1);
    expect(save.data.firstCatch.river).toEqual(newFirstCatch().river);
    const catchEvent = (out.db.events as { type: string; payload: { spot: string; fishId: string } }[])
      .find(e => e.type === 'catch');
    expect(catchEvent?.payload).toMatchObject({ spot: 'pond', fishId: expect.any(String) });
  });

  it('도감 기록이 있는 어종은 횟수를 이어 센다', async () => {
    // 연못 전 어종의 두 폼을 모두 채워 둔다 — 난수가 무엇을 뽑아도 기록이 있는 어종·폼이 잡힌다
    const dex: GameState['dex'] = {};
    for (const id of ['crucian', 'minnow', 'loach', 'carp', 'goldfish', 'goldcarp']) {
      const rec = { count: 5, maxSize: 99, first: '2026-01-01' };
      dex[id] = { normal: rec, variant: rec };
    }
    const out = await run({ state: { dex } }, { type: 'catch', spot: 'pond', judgment: 'perfect' });
    expect((out.res as { status: number }).status).toBe(200);
    const caught = (out.db.events as { type: string; payload: { fishId: string; form: string; isNew: boolean } }[])
      .find(e => e.type === 'catch')!.payload;
    const records = out.db.records as { fish_id: string; form: string; count: string }[];
    expect(caught.isNew).toBe(false);
    expect(records.find(r => r.fish_id === caught.fishId && r.form === caught.form)?.count).toBe('6');
    expect(Number((out.db.saves_current[0] as { version: string }).version)).toBe(3);
  });

  it('가방이 가득 차면 가장 덜 특별한 개체를 방생한다', async () => {
    const bag = Array.from({ length: WALK_BAG_CAP }, (_, i) => fish(i % 2 ? 'minnow' : 'crucian', { size: 10 + i }));
    const out = await run({ state: { bag } }, { type: 'catch', spot: 'pond', judgment: 'normal' });
    expect((out.res as { status: number }).status).toBe(200);
    // 자동 방생 이벤트는 놓아준 개체의 어종과 폼을 함께 남긴다
    const release = (out.db.events as { type: string; payload: { uids: string[]; fish: unknown[] } }[])
      .find(e => e.type === 'autoRelease')!;
    expect(release.payload.fish).toEqual([{ uid: release.payload.uids[0], fishId: expect.any(String), form: expect.any(String) }]);
    expect(out.db.fish_instances).toHaveLength(WALK_BAG_CAP);
    expect(Number((out.db.saves_current[0] as { version: string }).version)).toBe(3);
  });

  it('가방이 가득 차고 모두 잠겨 있으면 상한을 넘겨 보관한다', async () => {
    const bag = Array.from({ length: WALK_BAG_CAP }, (_, i) => fish('crucian', { size: 10 + i, locked: true }));
    const out = await run({ state: { bag } }, { type: 'catch', spot: 'pond', judgment: 'normal' });
    expect((out.res as { status: number }).status).toBe(200);
    expect(out.db.fish_instances).toHaveLength(WALK_BAG_CAP + 1);
    expect((out.db.events as { type: string }[]).some(e => e.type === 'autoRelease')).toBe(false);
    expect(Number((out.db.saves_current[0] as { version: string }).version)).toBe(3);
  });

  it('스냅샷 경계 버전은 전체 경로로 처리하고 saves에 아카이브를 남긴다', async () => {
    const out = await run({ state: { bag: [fish('crucian')] }, version: 49 }, { type: 'catch', spot: 'pond', judgment: 'good' });
    expect((out.res as { status: number }).status).toBe(200);
    expect(Number((out.db.saves_current[0] as { version: string }).version)).toBe(50);
    expect(out.db.saves).toHaveLength(1);
    expect(out.db.fish_instances).toHaveLength(2);
    expect((out.db.events as { type: string }[]).some(e => e.type === 'catch')).toBe(true);
  });

  it('잠긴 수역은 거부한다', async () => {
    expect(await run({ state: {} }, { type: 'catch', spot: 'sea', judgment: 'good' })).toMatchSnapshot();
  });

  it('진행 중인 일반 의뢰가 캐치에 맞으면 응답 전에 진행도가 오르고 신호를 반환한다', async () => {
    const uid = await seed({ state: { boat: 1 } });
    const quests = BOUNTIES.filter(b => b.zone === 'pacific' && b.difficulty !== 'named');
    for (const q of quests) {
      await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
        [uid, q.zone, q.id, NOW]);
    }
    const res = await callActionBeforeFollowUps(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good' });
    try {
      expect(res.status).toBe(200);
      const result = (res.body as { result: { type: string; fishId: string; bountyProgressed?: true } }).result;
      expect(result.type).toBe('catch');
      expect(result.bountyProgressed).toBe(true);
      const rarity = FISH.find(f => f.id === result.fishId)!.rarity;
      const expected = quests.filter(q => q.grade === rarity).map(q => q.id).sort();
      const { rows } = await env.client.query<{ quest_id: string; progress: number }>(
        'select quest_id, progress from public.bounty_progress where user_id = $1 and progress > 0', [uid]);
      expect(rows.map(r => r.quest_id).sort()).toEqual(expected);
      expect(rows.every(r => r.progress === 1)).toBe(true);
    } finally {
      await Promise.all(pendingAfterResponse.splice(0));
    }
    const out = await snapshotOf(uid, res);
    expect((out.db.saves_current[0] as { data: GameState }).data.firstCatch).toEqual(newFirstCatch());
  });

  it('강제 조우를 허용받은 캐치는 진행 중인 네임드의 도전권을 발급한다', async () => {
    const uid = await seed({ state: { boat: 1 } });
    const named = offeredQuestsFor('pacific', 'named', uid, TODAY_KST)[0];
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good', forceEncounter: true });
    const out = await snapshotOf(uid, res);
    expect((out.res as { status: number }).status).toBe(200);
    expect(out.db.bounty_tickets).toHaveLength(1);
    expect((out.db.events as { type: string }[]).some(e => e.type === 'ticket')).toBe(true);
    expect((out.db.saves_current[0] as { data: GameState }).data.firstCatch).toEqual(newFirstCatch());
  });

  it('강제 조우가 허용되지 않으면 통상 캐치로 처리한다', async () => {
    const uid = await seed({ state: { boat: 1 } });
    const named = offeredQuestsFor('pacific', 'named', uid, TODAY_KST)[0];
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
    process.env.DEPLOY_ENV = 'preview';
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good', forceEncounter: true });
    const out = await snapshotOf(uid, res);
    expect((out.res as { status: number }).status).toBe(200);
    expect(out.db.bounty_tickets).toHaveLength(0);
    expect((out.db.events as { type: string }[]).some(e => e.type === 'ticket')).toBe(false);
    expect((out.db.saves_current[0] as { data: GameState }).data.firstCatch).toEqual(newFirstCatch());
  });
});

describe('가방', () => {
  it('판매는 개체를 지우고 골드를 더한다', async () => {
    const sold = fish('carp', { uid: testUid(9001) });
    const out = await run({ state: { bag: [sold, fish('crucian')] } }, { type: 'sell', uids: [sold.uid] });
    const res = out.res as {
      status: number;
      body: { result: { type: string; gold: number }; patch: { version: number; scalars: { fortune: DailyFortune | null } } };
    };
    expect(res.status).toBe(200);
    const save = out.db.saves_current[0] as { version: string; gold: string; data: GameState };
    expect(save.version).toBe('3');
    expect(save.data.fortune).toEqual({
      day: TODAY_KST,
      kind: expect.toBeOneOf(ALL_FORTUNE_KINDS),
      index: expect.toBeOneOf([3, 5]),
    });
    expect(res.body.patch.scalars.fortune).toEqual(save.data.fortune);
    const expectedGold = sellSelected(
      { ...newState(), bag: [sold], fortune: save.data.fortune },
      [sold.uid],
      0,
      luckMultOf(save.data.fortune, 'sell'),
    ).gold;
    expect(Number(save.gold)).toBe(expectedGold);
    expect(res.body.result).toEqual({ type: 'sell', gold: expectedGold });
    expect(out.db.fish_instances).toMatchObject([{ fish_id: 'crucian', slot: null }]);
    expect(out.db.events).toEqual([
      { user_id: '<user>', type: 'sell', payload: { count: 1, gold: expectedGold, uids: ['<uuid>'] }, created_at: '<now>' },
    ]);
  });

  it('잠금은 개체의 잠금 열만 바꾼다', async () => {
    const a = fish('carp', { uid: testUid(9002) });
    const b = fish('crucian', { uid: testUid(9003), locked: true });
    const uid = await seed({ state: { bag: [a, b] } });
    const first = await callAction(userToken(uid), { type: 'setLocked', uids: [a.uid], locked: true });
    vi.setSystemTime(Date.parse(NOW) + 2000);
    const second = await callAction(userToken(uid), { type: 'setLocked', uids: [b.uid], locked: false });
    expect({ first: normalize(first, uid), ...(await snapshotOf(uid, second)) }).toMatchSnapshot();
  });

  it('전시는 개체를 칸으로 옮긴다', async () => {
    const a = fish('goldfish', { uid: testUid(9004) });
    expect(await run({ state: { bag: [a] } }, { type: 'exhibit', uid: a.uid, slot: 0 })).toMatchSnapshot();
  });
});

describe('상점·이동', () => {
  it('낚싯대 강화', async () => {
    expect(await run({ state: { gold: 100_000 } }, { type: 'upgradeRod' })).toMatchSnapshot();
  });

  it('골드가 모자란 강화는 거부한다', async () => {
    expect(await run({ state: { gold: 0 } }, { type: 'upgradeRod' })).toMatchSnapshot();
  });

  it('배 구매', async () => {
    expect(await run({ state: { gold: 300 } }, { type: 'buyBoat' })).toMatchSnapshot();
  });

  it('첫 방문 이동은 방문 이벤트를 남긴다', async () => {
    expect(await run({ state: { boat: 1 } }, { type: 'travel', to: { kind: 'region', id: 'world' } })).toMatchSnapshot();
  });
});

describe('쿠폰·지원 코드·편지', () => {
  it('정적 쿠폰', async () => {
    expect(await run({ state: {} }, { type: 'redeemCoupon', code: '출항준비' })).toMatchSnapshot();
  });

  it('동적 쿠폰과 비활성 쿠폰', async () => {
    await env.client.query(`insert into public.coupons (code, gold, description, active) values
      ('DYN-ON', 777, '동적', true), ('DYN-OFF', 999, '꺼짐', false)`);
    const uid = await seed({ state: {} });
    const on = await callAction(userToken(uid), { type: 'redeemCoupon', code: 'DYN-ON' });
    vi.setSystemTime(Date.parse(NOW) + 2000);
    const off = await callAction(userToken(uid), { type: 'redeemCoupon', code: 'DYN-OFF' });
    expect({ on: normalize(on, uid), ...(await snapshotOf(uid, off)) }).toMatchSnapshot();
  });

  it('지원 코드는 한 번만 받을 수 있다', async () => {
    await env.client.query(`insert into public.reliefs (code, gold, fame, rod, boat, dex) values
      ('RELIEF-1', 5000, 100, 3, 1, '{"carp":{"normal":{"count":2,"maxSize":40,"first":"2026-01-05"}}}')`);
    const first = await run({ state: {} }, { type: 'claimRelief', code: 'RELIEF-1' });
    const second = await run({ state: {} }, { type: 'claimRelief', code: 'RELIEF-1' });
    expect({ first, second }).toMatchSnapshot();
  });

  it('편지는 letters와 events에 같은 시각으로 남는다', async () => {
    expect(await run({ state: {} }, { type: 'sendLetter', text: '안녕하세요' })).toMatchSnapshot();
  });
});

describe('닉네임', () => {
  it('바꾸기', async () => {
    expect(await run({ state: {}, nickname: '처음' }, { type: 'setNickname', nickname: '바뀐이름' })).toMatchSnapshot();
  });

  it('다른 사용자가 쓰는 이름은 거부한다(대소문자 무시)', async () => {
    await seed({ nickname: 'Taken' });
    expect(await run({ state: {} }, { type: 'setNickname', nickname: 'taken' })).toMatchSnapshot();
  });

  it('형식이 틀린 이름은 리듀서가 거부한다', async () => {
    expect(await run({ state: {} }, { type: 'setNickname', nickname: '!' })).toMatchSnapshot();
  });
});

describe('현상금', () => {
  const pacificState = (): Partial<GameState> => ({ dex: zoneDex('pacific', 'named'), location: at('harbor') });

  it('오늘 배정된 일반 의뢰 수주는 수주·진행 행을 쓴다', async () => {
    const uid = await seed({ state: pacificState() });
    const quest = dailyQuestFor('pacific', 'easy', uid, TODAY_KST)!;
    const res = await callAction(userToken(uid), { type: 'acceptQuest', questId: quest.id, port: 'harbor' });
    expect(res.status).toBe(200);
    const snap = await snapshotOf(uid, res);
    expect(snap.db.bounty_accepts).toEqual([
      { user_id: '<user>', zone: 'pacific', port: 'harbor', quest_id: quest.id, accepted_at: '<now>' },
    ]);
    expect(snap.db.bounty_progress).toEqual([
      { user_id: '<user>', zone: 'pacific', quest_id: quest.id, progress: 0, started_at: '<now>', updated_at: '<now>' },
    ]);
    expect(snap.db.events).toEqual([
      { user_id: '<user>', type: 'acceptQuest', payload: { questId: quest.id, port: 'harbor' }, created_at: '<now>' },
      { user_id: '<user>', type: 'unlockAchievement', payload: { id: 'spot-basic-deep' }, created_at: '<now>' },
      { user_id: '<user>', type: 'unlockAchievement', payload: { id: 'spot-basic-sea' }, created_at: '<now>' },
    ]);
    const save = snap.db.saves_current[0] as { data: { achievements: Record<string, string> } };
    expect(save.data.achievements).toEqual({ 'spot-basic-sea': 'claimable', 'spot-basic-deep': 'claimable' });
  });

  it('배정되지 않은 의뢰 수주는 거부한다', async () => {
    const uid = await seed({ state: pacificState() });
    const offered = dailyQuestFor('pacific', 'easy', uid, TODAY_KST)!;
    const other = BOUNTIES.find(b => b.zone === 'pacific' && b.difficulty === 'easy' && b.id !== offered.id)!;
    const res = await callAction(userToken(uid), { type: 'acceptQuest', questId: other.id, port: 'harbor' });
    expect(await snapshotOf(uid, res)).toMatchSnapshot();
  });

  it('오늘 이미 클리어했으면 거부한다', async () => {
    const uid = await seed({ state: pacificState() });
    await env.client.query(`insert into public.bounty_clears (user_id, kind, quest_id, cleared_at)
      values ($1, 'general', 'pacific-easy-common', $2)`, [uid, NOW]);
    const quest = dailyQuestFor('pacific', 'easy', uid, TODAY_KST)!;
    const res = await callAction(userToken(uid), { type: 'acceptQuest', questId: quest.id, port: 'harbor' });
    expect(await snapshotOf(uid, res)).toMatchSnapshot();
  });

  it('완료한 의뢰 납품은 진행 행을 지우고 보상을 준다', async () => {
    const quest = BOUNTIES.find(b => b.zone === 'pacific' && b.difficulty === 'easy')!;
    const uid = await seed({ state: {} });
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, $4, $5)',
      [uid, quest.zone, quest.id, quest.count, NOW]);
    expect(await snapshotOf(uid, await callAction(userToken(uid), { type: 'deliverBounty', questId: quest.id })))
      .toMatchSnapshot();
  });

  it('완료하지 않은 의뢰 납품은 거부하고 진행 행을 남긴다', async () => {
    const quest = BOUNTIES.find(b => b.zone === 'pacific' && b.difficulty === 'easy')!;
    const uid = await seed({ state: {} });
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, quest.zone, quest.id, NOW]);
    expect(await snapshotOf(uid, await callAction(userToken(uid), { type: 'deliverBounty', questId: quest.id })))
      .toMatchSnapshot();
  });

  async function namedSetup(issuedAgoMs: number) {
    const uid = await seed({ state: { boat: 1 } });
    const named = offeredQuestsFor('pacific', 'named', uid, TODAY_KST)[0];
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
    await env.client.query('insert into public.bounty_tickets (user_id, quest_id, issued_at) values ($1, $2, $3)',
      [uid, named.id, new Date(Date.parse(NOW) - issuedAgoMs).toISOString()]);
    return { uid, named };
  }

  it('결투 승리는 진행도를 올리고 도전권을 지운다', async () => {
    const { uid, named } = await namedSetup(60_000);
    const res = await callAction(userToken(uid), { type: 'resolveChallenge', questId: named.id, success: true, hits: 99, misses: 0 });
    expect(res.status).toBe(200);
    const snap = await snapshotOf(uid, res);
    expect(snap.db.bounty_tickets).toEqual([]);
    expect(snap.db.bounty_progress).toEqual([
      { user_id: '<user>', zone: 'pacific', quest_id: named.id, progress: 1, started_at: '<now>', updated_at: '<now>' },
    ]);
    expect(snap.db.bounty_clears).toEqual([
      { user_id: '<user>', kind: 'named', quest_id: named.id, cleared_at: '<now>' },
    ]);
    expect(snap.db.records).toEqual([
      { user_id: '<user>', fish_id: named.targetFish, form: 'normal', count: '1', max_size: null, first_caught: '2030-03-04T00:00:00.000Z', updated_at: '<now>' },
    ]);
    expect(snap.db.events).toEqual([
      { user_id: '<user>', type: 'resolveChallenge', payload: { questId: named.id, success: true, hits: 99, misses: 0 }, created_at: '<now>' },
      { user_id: '<user>', type: 'unlockAchievement', payload: { id: 'named-megalodon-1' }, created_at: '<now>' },
    ]);
    const save = snap.db.saves_current[0] as { data: { achievements: Record<string, string> } };
    expect(save.data.achievements).toEqual({ 'named-megalodon-1': 'claimable' });
  });

  it('결투 패배는 도전권만 지운다', async () => {
    const { uid, named } = await namedSetup(60_000);
    const res = await callAction(userToken(uid), { type: 'resolveChallenge', questId: named.id, success: false, hits: 0, misses: 99 });
    expect(await snapshotOf(uid, res)).toMatchSnapshot();
  });

  it('만료된 도전권은 거부한다', async () => {
    const { uid, named } = await namedSetup(10.5 * 3600_000); // KST 03:36 발급 — 전날 게임 날짜
    const res = await callAction(userToken(uid), { type: 'resolveChallenge', questId: named.id, success: true, hits: 99, misses: 0 });
    expect(await snapshotOf(uid, res)).toMatchSnapshot();
  });

  it('재료가 있으면 유물을 교환한다', async () => {
    expect(await run({ state: { items: { 'mat-abyss-lantern': 1 } } }, { type: 'exchangeArtifact', artifact: 'abyss-angler' }))
      .toMatchSnapshot();
  });
});

describe('이사 코드 가져오기', () => {
  const save = { ...newState(), gold: 4321, fame: 77, bag: [fish('carp', { uid: testUid(9100) })],
    dex: { carp: { normal: { count: 1, maxSize: 30, first: '2026-01-01' } } } };

  it('소유자가 아니면 403이다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    expect(await run({ state: {}, email: 'someone@example.com' }, { type: 'import', save })).toMatchSnapshot();
  });

  it('소유자는 상태를 통째로 바꾸고 전체 상태를 돌려받는다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    expect(await run({ state: { bag: [fish('crucian')] }, admin: true }, { type: 'import', save })).toMatchSnapshot();
  });
});

describe('개발 명령', () => {
  it('로컬 환경의 상태 명령은 허용된다', async () => {
    expect(await run({ state: {} }, { type: 'debug', command: 'stats.set', args: { gold: 1000 } }))
      .toMatchSnapshot();
  });

  it('스테이징에서 소유자가 아니면 거부한다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    expect(await run({ state: {} }, { type: 'debug', command: 'stats.set', args: { gold: 1000 } })).toMatchSnapshot();
  });

  it('운영 배포는 거부한다', async () => {
    process.env.DEPLOY_ENV = 'production';
    expect(await run({ state: {} }, { type: 'debug', command: 'stats.set', args: { gold: 1000 } }))
      .toMatchSnapshot();
  });

  it('도감 채우기 명령은 도감 행을 쓴다', async () => {
    const snap = await run({ state: {} }, { type: 'debug', command: 'dex.completeZone', args: { zone: 'pacific' } });
    expect((snap.res as { status: number }).status).toBe(200);
    const expectedIds = zoneDexMissing(newState(), 'pacific', LICENSE_GRADES.named).sort();
    const recordFishIds = (snap.db.records as { fish_id: string; form: string; count: string }[])
      .map(r => r.fish_id)
      .sort();
    expect(recordFishIds).toEqual(expectedIds);
    expect(snap.db.events).toEqual([
      { user_id: '<user>', type: 'debug', payload: { command: 'dex.completeZone', args: { zone: 'pacific' } }, created_at: '<now>' },
      { user_id: '<user>', type: 'unlockAchievement', payload: { id: 'spot-basic-deep' }, created_at: '<now>' },
      { user_id: '<user>', type: 'unlockAchievement', payload: { id: 'spot-basic-sea' }, created_at: '<now>' },
    ]);
    const save = snap.db.saves_current[0] as { data: { achievements: Record<string, string> } };
    expect(save.data.achievements).toEqual({
      'spot-basic-sea': 'claimable',
      'spot-basic-deep': 'claimable',
    });
  });

  it('표 명령은 본인 행만 바꾼다', async () => {
    const other = await seed({ state: {} });
    const uid = await seed({ state: {} });
    for (const u of [uid, other]) {
      await env.client.query(`insert into public.bounty_tickets (user_id, quest_id, issued_at) values ($1, 'pacific-named-megalodon', $2)`, [u, NOW]);
      await env.client.query(`insert into public.bounty_clears (user_id, kind, quest_id, cleared_at)
        values ($1, 'general', 'pacific-easy-common', $2), ($1, 'general', 'pacific-easy-rare', '2030-03-01T00:00:00Z')`, [u, NOW]);
    }
    const near = await callAction(userToken(uid), { type: 'debug', command: 'bounty.expireTickets' });
    vi.setSystemTime(Date.parse(NOW) + 2000);
    const reset = await callAction(userToken(uid), { type: 'debug', command: 'bounty.resetToday' });
    vi.setSystemTime(Date.parse(NOW) + 4000);
    const clear = await callAction(userToken(uid), { type: 'debug', command: 'bounty.clearTickets' });
    expect({
      near: normalize(near, uid), reset: normalize(reset, uid), ...(await snapshotOf(uid, clear)),
      other: await dumpUser(env.client, other),
    }).toMatchSnapshot();
  });
});

describe('첫 액션 시딩 뒤 도감', () => {
  it('구 saves에서 시딩한 첫 캐치는 시딩한 도감 횟수를 이어 센다', async () => {
    const uid = await seed();
    const dex: Record<string, { normal: { count: number; maxSize: number; first: string } }> = {};
    for (const id of ['crucian', 'minnow', 'loach', 'carp', 'goldfish']) dex[id] = { normal: { count: 3, maxSize: 99, first: '2026-01-02' } };
    await env.client.query('insert into public.saves (user_id, data, updated_at) values ($1, $2, $3)', [uid, {
      v: 8, gold: 0, fame: 0, boat: 0, rod: 1, bag: [], exhibit: [], dex,
      coupons: [], location: at('home'), visited: [], artifacts: [], items: {}, activeBait: null,
    }, '2026-01-03T00:00:00.000Z']);
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' });
    expect(res.status).toBe(200);
    const { rows } = await env.client.query<{ fish_id: string; count: string }>(
      `select fish_id, count from public.records where user_id = $1 and form = 'normal'`, [uid]);
    // 잡힌 어종(일반 폼이면)은 3 → 4, 나머지는 시딩 값 3 그대로다. 변이로 잡혔으면 일반 폼 행은 전부 3이다
    const counts = rows.map(r => Number(r.count)).sort();
    expect(counts.every(c => c === 3 || c === 4)).toBe(true);
    expect(counts.filter(c => c === 1)).toEqual([]);
  });
});

describe('현상금 — 클리어 기준 한도와 만료', () => {
  // NOW(2030-03-04 KST 14:06)가 속한 게임 날짜는 그날 KST 04:00에 시작했다
  const DAY_START = '2030-03-03T19:00:00.000Z';
  const BEFORE_START = '2030-03-03T18:59:59.999Z';
  const pacificState = (): Partial<GameState> => ({ dex: zoneDex('pacific', 'named'), location: at('harbor') });
  const namedState = (): Partial<GameState> => ({ dex: zoneDex('pacific', 'named'), location: at('harbor') });
  const offered = (uid: string, difficulty: 'easy' | 'normal' | 'hard' | 'named', day = TODAY_KST) =>
    offeredQuestsFor('pacific', difficulty, uid, day)[0];
  const accept = (uid: string, questId: string) =>
    callAction(userToken(uid), { type: 'acceptQuest', questId, port: 'harbor' });
  const deliver = (uid: string, questId: string) => callAction(userToken(uid), { type: 'deliverBounty', questId });
  const after = (ms: number) => vi.setSystemTime(Date.parse(NOW) + ms);
  const progressRow = (uid: string, questId: string, progress: number, startedAt: string) =>
    env.client.query(`insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at, updated_at)
      values ($1, $2, $3, $4, $5, $5)`, [uid, bountyById(questId)!.zone, questId, progress, startedAt]);
  const clearRow = (uid: string, kind: string, questId: string, clearedAt: string) =>
    env.client.query('insert into public.bounty_clears (user_id, kind, quest_id, cleared_at) values ($1, $2, $3, $4)',
      [uid, kind, questId, clearedAt]);
  const ticketRow = (uid: string, questId: string, issuedAt: string) =>
    env.client.query('insert into public.bounty_tickets (user_id, quest_id, issued_at) values ($1, $2, $3)', [uid, questId, issuedAt]);
  const questIds = async (uid: string) => ((await dumpUser(env.client, uid)).bounty_progress as { quest_id: string }[]).map(r => r.quest_id);

  it('수주는 수주 기록과 진행 행을 서버 시각으로 쓰고 클리어는 쓰지 않는다 — 수주만으로는 한도를 쓰지 않는다', async () => {
    const uid = await seed({ state: pacificState() });
    const quest = offered(uid, 'easy');
    expect((await accept(uid, quest.id)).status).toBe(200);
    const dump = await dumpUser(env.client, uid);
    expect(dump.bounty_progress).toEqual([{
      user_id: '<user>', zone: 'pacific', quest_id: quest.id, progress: 0, started_at: '<now>', updated_at: '<now>',
    }]);
    expect(dump.bounty_accepts).toEqual([{
      user_id: '<user>', zone: 'pacific', port: 'harbor', quest_id: quest.id, accepted_at: '<now>',
    }]);
    expect(dump.bounty_clears).toEqual([]);
  });

  it('일반 의뢰 납품은 같은 확정 문장에서 클리어를 남기고 진행 행을 지운다', async () => {
    const quest = bountyById('pacific-easy-common')!;
    const uid = await seed({ state: {} });
    await progressRow(uid, quest.id, quest.count, NOW);
    expect((await deliver(uid, quest.id)).status).toBe(200);
    const dump = await dumpUser(env.client, uid);
    expect(dump.bounty_clears).toEqual([{ user_id: '<user>', kind: 'general', quest_id: quest.id, cleared_at: '<now>' }]);
    expect(dump.bounty_progress).toEqual([]);
  });

  it('네임드 토벌은 resolveChallenge 성공 시 1회만 named 클리어로 남고 deliverBounty는 중복 기록하지 않는다', async () => {
    const quest = bountyById('pacific-named-megalodon')!;
    const uid = await seed({ state: {} });
    await progressRow(uid, quest.id, 0, NOW);
    await ticketRow(uid, quest.id, NOW);
    expect((await callAction(userToken(uid), {
      type: 'resolveChallenge', questId: quest.id, success: true, hits: 99, misses: 0,
    })).status).toBe(200);
    expect((await dumpUser(env.client, uid)).bounty_clears)
      .toEqual([{ user_id: '<user>', kind: 'named', quest_id: quest.id, cleared_at: '<now>' }]);
    after(2000);
    expect((await deliver(uid, quest.id)).status).toBe(200);
    const dump = await dumpUser(env.client, uid);
    expect(dump.bounty_clears)
      .toEqual([{ user_id: '<user>', kind: 'named', quest_id: quest.id, cleared_at: NOW }]);
    expect(dump.bounty_progress).toEqual([]);

    const standaloneUid = await seed({ state: {} });
    await progressRow(standaloneUid, quest.id, 1, NOW);
    expect((await deliver(standaloneUid, quest.id)).status).toBe(200);
    expect((await dumpUser(env.client, standaloneUid)).bounty_clears).toEqual([]);
  });

  it('같은 의뢰를 동시에 납품해도 보상과 클리어는 한 번이다', async () => {
    const quest = bountyById('pacific-easy-common')!;
    const uid = await seed({ state: {} });
    await progressRow(uid, quest.id, quest.count, NOW);
    const results = await Promise.all([deliver(uid, quest.id), deliver(uid, quest.id)]);
    // 진 쪽은 진행 행이 이미 없어 거부된다(422). 확정 문장이 겹쳐 같은 버전을 읽은 쪽도
    // 진행 행이 지워진 것을 다시 읽어 422를 받으므로 409는 나오지 않는다
    const statuses = results.map(r => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(422);
    const dump = await dumpUser(env.client, uid);
    expect(dump.bounty_clears).toHaveLength(1);
    expect(dump.saves_current[0]).toMatchObject({ gold: String(quest.reward) });
  });

  it('납품이 거부되면 클리어도 남기지 않는다', async () => {
    const quest = bountyById('pacific-easy-common')!;
    const uid = await seed({ state: {} });
    await progressRow(uid, quest.id, quest.count - 1, NOW);
    expect(await deliver(uid, quest.id)).toMatchObject({ status: 422, body: { error: 'quest-incomplete' } });
    const dump = await dumpUser(env.client, uid);
    expect(dump.bounty_clears).toEqual([]);
    expect(dump.bounty_progress).toHaveLength(1);
  });

  it('한 갈래를 클리어하면 그 갈래만 막힌다 — 일반을 클리어해도 네임드는 수주한다', async () => {
    const uid = await seed({ state: namedState() });
    await clearRow(uid, 'general', 'pacific-easy-common', NOW);
    expect(await accept(uid, offered(uid, 'easy').id)).toMatchObject({ status: 422, body: { error: 'daily-cleared' } });
    after(2000);
    expect((await accept(uid, offered(uid, 'named').id)).status).toBe(200);
  });

  it('클리어 뒤에는 같은 날 수주하지 못하고 다음 게임 날짜(KST 04:00 정각)부터 수주한다', async () => {
    const uid = await seed({ state: pacificState() });
    const first = offered(uid, 'easy');
    expect((await accept(uid, first.id)).status).toBe(200);
    await env.client.query('update public.bounty_progress set progress = $2 where user_id = $1', [uid, first.count]);
    after(2000);
    expect((await deliver(uid, first.id)).status).toBe(200);
    after(4000);
    expect(await accept(uid, offered(uid, 'normal').id)).toMatchObject({ status: 422, body: { error: 'daily-cleared' } });
    // 다음 날 KST 03:59:59.999 — 아직 같은 게임 날짜다
    vi.setSystemTime(Date.parse('2030-03-04T18:59:59.999Z'));
    expect(await accept(uid, offered(uid, 'normal').id)).toMatchObject({ status: 422, body: { error: 'daily-cleared' } });
    // 04:00 정각 — 다음 게임 날짜, 일일 의뢰도 그날 것으로 바뀐다
    vi.setSystemTime(Date.parse('2030-03-04T19:00:00.000Z'));
    expect((await accept(uid, offered(uid, 'normal', '2030-03-05').id)).status).toBe(200);
  });

  it('일반 의뢰가 진행 중이면 다른 난이도도 수주하지 못하고 네임드는 수주한다 — 갈래마다 하나씩', async () => {
    const uid = await seed({ state: namedState() });
    const held = offered(uid, 'normal');
    await progressRow(uid, held.id, 0, NOW);
    expect(await accept(uid, offered(uid, 'easy').id)).toMatchObject({ status: 422, body: { error: 'quest-active' } });
    after(2000);
    expect((await accept(uid, offered(uid, 'named').id)).status).toBe(200);
    expect(await questIds(uid)).toEqual([offered(uid, 'named').id, held.id].sort());
  });

  it('오늘 배정은 게임 날짜로 정한다 — KST 04:00 전에는 전날 배정 의뢰만 수주한다', async () => {
    let n = 5000;
    const differs = (u: string) => offered(u, 'easy', '2030-03-03').id !== offered(u, 'easy', '2030-03-04').id;
    while (!differs(testUid(n))) n++;
    const uid = await seed({ uid: testUid(n), state: pacificState() });
    vi.setSystemTime(Date.parse('2030-03-03T18:59:59.000Z')); // 2030-03-04 KST 03:59:59
    expect(await accept(uid, offered(uid, 'easy', '2030-03-04').id)).toMatchObject({ status: 422, body: { error: 'bad-request' } });
    expect((await accept(uid, offered(uid, 'easy', '2030-03-03').id)).status).toBe(200);
  });

  describe('만료', () => {
    it('경계 이전에 수주하고 마치지 못한 의뢰는 없는 것이라 새 수주를 막지 않고, 정리된다', async () => {
      const uid = await seed({ state: pacificState() });
      const stale = offered(uid, 'normal');
      await progressRow(uid, stale.id, stale.count - 1, BEFORE_START); // 한 마리 모자라 마치지 못했다
      const quest = offered(uid, 'easy');
      expect((await accept(uid, quest.id)).status).toBe(200);
      expect(await questIds(uid)).toEqual([quest.id]); // 만료 행은 응답 뒤 정리로 지워졌다
    });

    it('수주 시각이 04:00 정각이면 오늘 몫이라 만료되지 않는다 — 1ms 전과 갈린다', async () => {
      const onTime = await seed({ state: pacificState() });
      await progressRow(onTime, offered(onTime, 'normal').id, 0, DAY_START);
      expect(await accept(onTime, offered(onTime, 'easy').id)).toMatchObject({ status: 422, body: { error: 'quest-active' } });
      const late = await seed({ state: pacificState() });
      await progressRow(late, offered(late, 'normal').id, 0, BEFORE_START);
      expect((await accept(late, offered(late, 'easy').id)).status).toBe(200);
    });

    it('마친 의뢰는 경계를 넘어도 보상을 받을 수 있고 클리어는 받은 날의 몫이다', async () => {
      const quest = bountyById('pacific-easy-common')!;
      const uid = await seed({ state: pacificState() });
      await progressRow(uid, quest.id, quest.count, BEFORE_START);
      expect((await deliver(uid, quest.id)).status).toBe(200);
      const dump = await dumpUser(env.client, uid);
      expect(dump.bounty_clears).toEqual([{ user_id: '<user>', kind: 'general', quest_id: quest.id, cleared_at: '<now>' }]);
      expect(dump.bounty_progress).toEqual([]);
      after(2000);
      expect(await accept(uid, offered(uid, 'easy').id)).toMatchObject({ status: 422, body: { error: 'daily-cleared' } });
    });

    it('마쳤지만 보상을 받지 않은 의뢰가 남아 있으면 같은 갈래는 수주하지 못한다', async () => {
      const quest = bountyById('pacific-easy-common')!;
      const uid = await seed({ state: pacificState() });
      await progressRow(uid, quest.id, quest.count, BEFORE_START);
      expect(await accept(uid, offered(uid, 'normal').id)).toMatchObject({ status: 422, body: { error: 'quest-active' } });
    });

    it('만료된 의뢰를 다시 수주하면 진행도 0·새 시작 시각으로 시작하고 묵은 도전권은 지워진다', async () => {
      const uid = await seed({ state: namedState() });
      const named = offered(uid, 'named');
      await progressRow(uid, named.id, 0, BEFORE_START);
      await ticketRow(uid, named.id, '2030-03-03T18:30:00.000Z'); // 아직 유효 시간 안이지만 전날 수주의 것이다
      expect((await accept(uid, named.id)).status).toBe(200);
      const dump = await dumpUser(env.client, uid);
      expect(dump.bounty_progress).toEqual([{
        user_id: '<user>', zone: 'pacific', quest_id: named.id, progress: 0, started_at: '<now>', updated_at: '<now>',
      }]);
      expect(dump.bounty_tickets).toEqual([]);
    });

    it('만료된 일반 의뢰를 같은 의뢰로 다시 수주하면 묵은 진행도를 이어받지 않는다', async () => {
      const uid = await seed({ state: pacificState() });
      const quest = offered(uid, 'easy');
      await progressRow(uid, quest.id, Math.min(quest.count - 1, 100), BEFORE_START);
      expect((await accept(uid, quest.id)).status).toBe(200);
      expect((await dumpUser(env.client, uid)).bounty_progress).toEqual([{
        user_id: '<user>', zone: 'pacific', quest_id: quest.id, progress: 0, started_at: '<now>', updated_at: '<now>',
      }]);
    });

    it('만료된 네임드 의뢰의 도전권으로는 결투 결과를 확정하지 못한다', async () => {
      const uid = await seed({ state: { boat: 1 } });
      const named = offered(uid, 'named');
      await progressRow(uid, named.id, 0, BEFORE_START);
      await ticketRow(uid, named.id, '2030-03-03T18:30:00.000Z');
      expect(await callAction(userToken(uid), { type: 'resolveChallenge', questId: named.id, success: true, hits: 99, misses: 0 }))
        .toMatchObject({ status: 422, body: { error: 'ticket-expired' } });
    });

    it('수배 액션이 만료 행과 그 도전권을 지우고 살아 있는 행은 남긴다', async () => {
      const uid = await seed({ state: {} });
      await progressRow(uid, 'pacific-easy-common', 10, BEFORE_START);          // 만료
      await progressRow(uid, 'pacific-named-megalodon', 0, BEFORE_START);       // 만료 + 도전권
      await ticketRow(uid, 'pacific-named-megalodon', '2030-03-03T18:30:00.000Z');
      await progressRow(uid, 'pacific-normal-common', 0, DAY_START);            // 04:00 정각 — 오늘 몫
      await progressRow(uid, 'pacific-hard-legendary', 2, '2030-02-01T00:00:00.000Z'); // 마쳤다(수량 2) — 보상 대기
      await progressRow(uid, 'seasia-named-leviathan', 0, NOW);                 // 오늘 수주 + 도전권
      await ticketRow(uid, 'seasia-named-leviathan', NOW);
      expect((await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' })).status).toBe(200);
      expect(await questIds(uid)).toEqual(['pacific-hard-legendary', 'pacific-normal-common', 'seasia-named-leviathan']);
      expect(((await dumpUser(env.client, uid)).bounty_tickets as { quest_id: string }[]).map(r => r.quest_id))
        .toEqual(['seasia-named-leviathan']);
    });

    it('발급 4시간이 지나도 같은 게임 날짜의 도전권으로는 결투 결과를 확정한다', async () => {
      const uid = await seed({ state: { boat: 1 } });
      const named = offered(uid, 'named');
      await progressRow(uid, named.id, 0, DAY_START);
      await ticketRow(uid, named.id, DAY_START);           // KST 04:00 발급 — NOW(KST 14:06)는 10시간 뒤
      expect((await callAction(userToken(uid), { type: 'resolveChallenge', questId: named.id, success: true, hits: 99, misses: 0 })).status)
        .toBe(200);
    });
  });
});

describe('첫 경험 보장', () => {
  const stateOf = (out: Awaited<ReturnType<typeof run>>) => (out.db.saves_current[0] as { data: GameState }).data;
  const normalDex = (...ids: string[]): GameState['dex'] =>
    Object.fromEntries(ids.map(id => [id, { normal: { count: 1, maxSize: 20, first: '2026-01-01' } }]));

  it('마을 연못 상한 마지막 캐치는 미보유 일반 폼 어종을 일반 폼으로 보장하고 연못 보장만 끝난다', async () => {
    const out = await run({
      state: {
        dex: normalDex('crucian', 'minnow', 'loach', 'carp', 'goldfish'),
        firstCatch: { ...newFirstCatch(), pond: { n: 19, active: true } },
      },
    }, { type: 'catch', spot: 'pond', judgment: 'auto' });
    const caught = (out.db.events[0] as { payload: { fishId: string; form: string } }).payload;
    expect(caught).toMatchObject({ fishId: 'goldcarp', form: 'normal' });
    expect(stateOf(out).firstCatch.pond).toEqual(endedFirstCatch().pond);
    expect(stateOf(out).firstCatch.river).toEqual(newFirstCatch().river);
  });

  it('첫 캐치에서 해당 해역의 카운트만 오르고 다른 해역 진척은 그대로다', async () => {
    const out = await run({ state: {} }, { type: 'catch', spot: 'pond', judgment: 'auto' });
    const fc = stateOf(out).firstCatch;
    expect(fc.pond).toEqual({ n: 1, active: true });
    expect(fc.river).toEqual(newFirstCatch().river);
  });

  it('마을 연못 여유 구간 지연 보장은 일반 폼을 고정하고 활성 상태를 유지한다', async () => {
    const out = await run({
      state: { firstCatch: { ...newFirstCatch(), pond: { n: 3, active: true } } },
    }, { type: 'catch', spot: 'pond', judgment: 'auto' });
    const caught = (out.db.events[0] as { payload: { form: string } }).payload;
    expect(caught.form).toBe('normal');
    expect(stateOf(out).firstCatch.pond).toEqual({ n: 4, active: true });
    expect(stateOf(out).firstCatch.river).toEqual(newFirstCatch().river);
  });

  it('마을 강 상한 마지막 캐치는 미보유 일반 폼 어종을 일반 폼으로 보장하고 강 보장만 끝난다', async () => {
    const out = await run({
      state: {
        dex: normalDex('sweetfish', 'catfish', 'mandarin', 'salmon', 'rainbow'),
        firstCatch: { ...newFirstCatch(), river: { n: 29, active: true } },
      },
    }, { type: 'catch', spot: 'river', judgment: 'auto' });
    const caught = (out.db.events[0] as { payload: { fishId: string; form: string } }).payload;
    expect(caught).toMatchObject({ fishId: 'riverlord', form: 'normal' });
    expect(stateOf(out).firstCatch.river).toEqual(endedFirstCatch().river);
    expect(stateOf(out).firstCatch.pond).toEqual(newFirstCatch().pond);
  });

  it('마을 연못 전종 일반 폼을 이미 보유하면 상한 전이라도 캐치 후 연못 보장이 닫힌다', async () => {
    const out = await run({
      state: {
        dex: normalDex('crucian', 'minnow', 'loach', 'carp', 'goldfish', 'goldcarp'),
        firstCatch: { ...newFirstCatch(), pond: { n: 5, active: true } },
      },
    }, { type: 'catch', spot: 'pond', judgment: 'auto' });
    expect(stateOf(out).firstCatch.pond).toEqual(endedFirstCatch().pond);
    expect(stateOf(out).firstCatch.river).toEqual(newFirstCatch().river);
  });

  it('구 단일 firstCatch가 진행 중이고 강 도감이 있으면 catch가 풀 경로로 폴백해 강 보장을 중복 지급하지 않는다', async () => {
    const dex: GameState['dex'] = { sweetfish: { normal: { count: 1, maxSize: 20, first: '2026-01-01' } } };
    const uid = await seed({ state: { dex } });
    // 구 단일 객체 형식을 saves_current.data.firstCatch에 직접 심는다
    await env.client.query(
      `update public.saves_current set data = jsonb_set(data, '{firstCatch}', $2::jsonb) where user_id = $1`,
      [uid, JSON.stringify({ n: 6, legendAt: 18, epic: false, legend: true })],
    );
    const out = await snapshotOf(uid, await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'auto' }));
    expect((out.res as { status: number }).status).toBe(200);
    expect(stateOf(out).firstCatch).toEqual({
      pond: { n: 7, active: true },
      river: endedFirstCatch().river,
    });
  });
});

describe('천장', () => {
  it('어종 천장에 닿은 미보유 어종은 일반 폼으로 확정하고 천장을 끝낸다', async () => {
    const out = await run({ state: { pity: { goldcarp: SPECIES_PITY_K } } }, { type: 'catch', spot: 'pond', judgment: 'auto' });
    const caught = (out.db.events[0] as { payload: Record<string, unknown> }).payload;
    expect(caught).toMatchObject({ fishId: 'goldcarp', form: 'normal', pity: true });
    const data = (out.db.saves_current[0] as { data: GameState }).data;
    expect(data.pity.goldcarp).toBe(PITY_DONE);
  });

  it('어종 천장 후보가 이미 일반 폼을 가진 어종이면 확정하지 않고 끝 표시만 한다', async () => {
    const dex: GameState['dex'] = { goldcarp: { normal: { count: 1, maxSize: 50, first: '2026-01-01' } } };
    const out = await run({ state: { dex, pity: { goldcarp: SPECIES_PITY_K } } }, { type: 'catch', spot: 'pond', judgment: 'auto' });
    const caught = (out.db.events[0] as { payload: Record<string, unknown> }).payload;
    expect(caught.pity).toBeUndefined();
    const data = (out.db.saves_current[0] as { data: GameState }).data;
    expect(data.pity.goldcarp).toBe(PITY_DONE);
  });

  it('네임드 천장에 닿은 캐치는 도전권을 발급하고 빗나감 수를 되돌린다', async () => {
    const uid = await seed({ state: { boat: 1, namedPity: { day: TODAY_KST, misses: NAMED_PITY_CATCHES - 1, fails: 0, wounds: {} } } });
    const named = offeredQuestsFor('pacific', 'named', uid, TODAY_KST)[0];
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
    await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good' });
    const db = await dumpUser(env.client, uid);
    expect(db.bounty_tickets).toHaveLength(1);
    expect((db.saves_current[0] as { data: GameState }).data.namedPity).toEqual({ day: TODAY_KST, misses: 0, fails: 0, wounds: {} });
  });
});

// 파일 끝에 둔다 — 시드 순번(testUid)을 쓰므로 앞에 두면 뒤쪽 스냅샷의 사용자 id가 밀린다
describe('우편 받기', () => {
  it('본인의 받지 않은 골드 우편만 한 번 받는다', async () => {
    const uid = await seed({ state: { gold: 1000 } });
    const other = await seed({ state: {} });
    const { rows } = await env.client.query<{ id: string; user_id: string }>(`insert into public.mails (user_id, title, body, gold)
      values ($1, '환급', '본문', 500), ($2, '남의 우편', '본문', 900), ($1, '글만', '본문', 0) returning id, user_id`, [uid, other]);
    const [mine, others, textOnly] = rows.map(r => Number(r.id));

    const first = await callAction(userToken(uid), { type: 'claimMail', id: mine });
    expect(first.status).toBe(200);
    expect((first.body as { result: unknown }).result).toEqual({ type: 'mail', gold: 500 });
    vi.setSystemTime(Date.parse(NOW) + 2000);
    const again = await callAction(userToken(uid), { type: 'claimMail', id: mine });
    vi.setSystemTime(Date.parse(NOW) + 4000);
    const notMine = await callAction(userToken(uid), { type: 'claimMail', id: others });
    vi.setSystemTime(Date.parse(NOW) + 6000);
    const noGold = await callAction(userToken(uid), { type: 'claimMail', id: textOnly });
    for (const res of [again, notMine, noGold]) expect(res).toMatchObject({ status: 422, body: { error: 'mail-unavailable' } });

    const gold = await env.client.query<{ gold: string }>('select gold from public.saves_current where user_id = $1', [uid]);
    expect(Number(gold.rows[0].gold)).toBe(1500);
    const mails = await env.client.query<{ id: string; claimed_at: Date | null; read_at: Date | null }>(
      'select id, claimed_at, read_at from public.mails where id = any($1::bigint[]) order by id', [[mine, others]]);
    expect(mails.rows[0].claimed_at?.toISOString()).toBe(NOW);
    expect(mails.rows[0].read_at?.toISOString()).toBe(NOW);
    expect(mails.rows[1].claimed_at).toBeNull();
    const ev = await env.client.query<{ payload: unknown }>(`select payload from public.events where user_id = $1 and type = 'claimMail'`, [uid]);
    expect(ev.rows.map(r => r.payload)).toEqual([{ mailId: mine, gold: 500 }]);
  });

  it('같은 우편을 동시에 두 번 받으면 한 번만 지급되고 받은 기록과 골드가 함께 남는다', async () => {
    const uid = await seed({ state: { gold: 0 } });
    const { rows } = await env.client.query<{ id: string }>(
      `insert into public.mails (user_id, title, body, gold) values ($1, '동시', '본문', 800) returning id`, [uid]);
    const id = Number(rows[0].id);
    const results = await Promise.all([
      callAction(userToken(uid), { type: 'claimMail', id }),
      callAction(userToken(uid), { type: 'claimMail', id }),
    ]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    // 두 요청이 겹치면 409(동시 갱신)나 422(이미 받음)다. 어느 쪽이든 지급은 한 번이다
    expect(results.filter(r => r.status !== 200).map(r => r.status)).toEqual([expect.toBeOneOf([409, 422])]);
    const gold = await env.client.query<{ gold: string }>('select gold from public.saves_current where user_id = $1', [uid]);
    expect(Number(gold.rows[0].gold)).toBe(800);
    const mail = await env.client.query<{ claimed_at: Date | null }>('select claimed_at from public.mails where id = $1', [id]);
    expect(mail.rows[0].claimed_at).not.toBeNull();
  });
});

describe('캐치 간격과 활성 창', () => {
  const CLIENT_A = '11111111-1111-4111-8111-111111111111';
  const CLIENT_B = '22222222-2222-4222-8222-222222222222';
  const ago = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString();
  const column = async (uid: string, name: 'last_catch_at' | 'active_client') =>
    (await env.client.query(`select ${name} as v from public.saves_current where user_id = $1`, [uid])).rows[0].v as unknown;

  it('직전 캐치로부터 낚시 한 사이클이 지나지 않은 catch는 429다', async () => {
    const uid = await seed({ state: {}, lastCatchAt: ago(2_000) });
    expect(await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' }))
      .toMatchObject({ status: 429, body: { error: 'too-fast' } });
  });

  it('한 사이클이 지난 catch는 받고 캐치 시각을 남긴다', async () => {
    const uid = await seed({ state: {}, lastCatchAt: ago(60_000) });
    expect(await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' })).toMatchObject({ status: 200 });
    expect((await column(uid, 'last_catch_at') as Date).toISOString()).toBe(NOW);
  });

  it('활성 창이 아닌 창의 액션은 423이다', async () => {
    const uid = await seed({ state: {}, activeClient: CLIENT_A });
    expect(await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' }, { clientId: CLIENT_B }))
      .toMatchObject({ status: 423, body: { error: 'session-replaced' } });
    expect(await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' }, { clientId: CLIENT_A }))
      .toMatchObject({ status: 200 });
  });

  it('boot한 창이 활성 창이 되고 이전 창의 액션은 423이 된다', async () => {
    const uid = await seed({ state: {}, activeClient: CLIENT_A });
    expect(await callAction(userToken(uid), { type: 'boot', buildId: 'dev' }, { clientId: CLIENT_B }))
      .toMatchObject({ status: 200 });
    expect(await column(uid, 'active_client')).toBe(CLIENT_B);
    vi.setSystemTime(Date.parse(NOW) + 60_000);
    expect(await callAction(userToken(uid), { type: 'upgradeRod' }, { clientId: CLIENT_A }))
      .toMatchObject({ status: 423, body: { error: 'session-replaced' } });
  });

  it('활성 창 기록이 없으면 창 식별자 없이도 받는다', async () => {
    const uid = await seed({ state: {} });
    expect(await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' })).toMatchObject({ status: 200 });
  });
});

describe('항구 빠른 이동', () => {
  const locationOf = async (uid: string) =>
    (await env.client.query("select data -> 'location' as v from public.saves_current where user_id = $1", [uid])).rows[0].v as unknown;

  it('배가 그 바다의 진입 단계에 못 미치면 422로 거부하고 위치를 그대로 둔다', async () => {
    const uid = await seed({ state: { boat: 2, location: at('harbor') } });
    expect(await callAction(userToken(uid), { type: 'travel', to: { kind: 'base', id: 'manila' } }))
      .toMatchObject({ status: 422, body: { error: 'zone-locked' } });
    expect(await locationOf(uid)).toEqual({ kind: 'base', id: 'harbor' });
  });

  it('배가 진입 단계 이상이면 그 항구로 옮긴다', async () => {
    const uid = await seed({ state: { boat: 3, location: at('harbor') } });
    expect(await callAction(userToken(uid), { type: 'travel', to: { kind: 'base', id: 'manila' } }))
      .toMatchObject({ status: 200 });
    expect(await locationOf(uid)).toEqual({ kind: 'base', id: 'manila' });
  });
});

describe('옷장', () => {
  const saved = async (uid: string) => {
    const { rows } = await env.client.query('select gold, data from public.saves_current where user_id = $1', [uid]);
    return { gold: Number(rows[0].gold), look: rows[0].data.look, hats: rows[0].data.hats };
  };

  it('모자 구매, 착용, 옷 바꾸기가 저장에 남는다', async () => {
    const uid = await seed({ state: { gold: 120_000 } });
    const buy = await callAction(userToken(uid), { type: 'buyHat', hat: 'cap-red' });
    expect(buy.status).toBe(200);
    vi.setSystemTime(Date.parse(NOW) + 2000);
    const wear = await callAction(userToken(uid), { type: 'wearHat', hat: 'cap-red' });
    expect(wear.status).toBe(200);
    vi.setSystemTime(Date.parse(NOW) + 4000);
    const clothes = await callAction(userToken(uid), { type: 'changeClothes', shirt: 6, pants: 1 });
    expect(clothes.status).toBe(200);
    expect(await saved(uid)).toEqual({ gold: 70_000, look: { shirt: 6, pants: 1, hat: 'cap-red' }, hats: ['cap-red'] });
  });

  it('골드가 모자라거나 갖지 않은 모자는 거부하고 저장을 바꾸지 않는다', async () => {
    const uid = await seed({ state: { gold: 49_999 } });
    expect((await callAction(userToken(uid), { type: 'buyHat', hat: 'cap-red' })).body).toMatchObject({ error: 'not-enough-gold' });
    vi.setSystemTime(Date.parse(NOW) + 2000);
    expect((await callAction(userToken(uid), { type: 'wearHat', hat: 'cap-red' })).body).toMatchObject({ error: 'hat-not-owned' });
    vi.setSystemTime(Date.parse(NOW) + 4000);
    expect((await callAction(userToken(uid), { type: 'changeClothes', shirt: 12, pants: 0 })).status).toBe(422);
    expect((await saved(uid)).gold).toBe(49_999);
  });
});

describe('자동 잠금', () => {
  it('자동 잠금은 요청 한 번으로 잠금과 해제를 함께 적용한다', async () => {
    const small = fish('carp', { uid: testUid(9010), size: 10, locked: true });
    const big = fish('carp', { uid: testUid(9011), size: 30 });
    const uid = await seed({ state: { bag: [small, big] } });
    const out = await callAction(userToken(uid), { type: 'autoLock' });
    expect(out.status).toBe(200);
    const snap = await snapshotOf(uid, out);
    const instances = snap.db.fish_instances as Array<{ size: number; locked: boolean }>;
    expect(instances.map((r) => ({ size: r.size, locked: r.locked }))).toEqual([
      { size: 10, locked: false },
      { size: 30, locked: true },
    ]);
    const current = snap.db.saves_current[0] as { data: { autoLockedIds?: Record<string, string> } };
    expect(current.data.autoLockedIds).toEqual({
      'carp|normal': '<uuid>',
    });
  });
});

describe('유물 레벨과 마미 와타의 거울', () => {
  const namedState = (): Partial<GameState> => ({ dex: zoneDex('pacific', 'named'), location: at('harbor') });
  const offeredNamed = (uid: string) => offeredQuestsFor('pacific', 'named', uid, TODAY_KST)[0];
  const accept = (uid: string, questId: string) =>
    callAction(userToken(uid), { type: 'acceptQuest', questId, port: 'harbor' });
  const clearRow = (uid: string) =>
    env.client.query('insert into public.bounty_clears (user_id, kind, quest_id, cleared_at) values ($1, $2, $3, $4)',
      [uid, 'named', 'pacific-named-megalodon', NOW]);
  const stateRowOf = async (uid: string) =>
    ((await dumpUser(env.client, uid)).saves_current as { gold: string; data: { items?: Record<string, number>; artifactLevels?: unknown } }[])[0];

  it('재료를 써서 유물 레벨을 올리고 레벨 맵을 blob에 남긴다', async () => {
    const uid = await seed({ state: { artifacts: ['wreck-compass'], items: { 'mat-wreck-compass': 3 } } });
    expect((await callAction(userToken(uid), { type: 'levelUpArtifact', artifact: 'wreck-compass' })).status).toBe(200);
    const data = (await stateRowOf(uid)).data;
    expect(data.artifactLevels).toEqual({ 'wreck-compass': 2 });
    expect(data.items).toEqual({ 'mat-wreck-compass': 2 });
  });

  it('재료가 모자라면 레벨업을 거부한다', async () => {
    const uid = await seed({ state: { artifacts: ['wreck-compass'], items: {} } });
    expect(await callAction(userToken(uid), { type: 'levelUpArtifact', artifact: 'wreck-compass' }))
      .toMatchObject({ status: 422, body: { error: 'material-missing' } });
  });

  it('거울을 가지면 네임드 토벌 골드가 30% 줄고 교환 재료 수는 그대로다', async () => {
    const quest = bountyById('pacific-named-megalodon')!;
    const uid = await seed({ state: { artifacts: ['mami-wata-mirror'] } });
    await env.client.query(`insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at, updated_at)
      values ($1, $2, $3, 1, $4, $4)`, [uid, quest.zone, quest.id, NOW]);
    expect((await callAction(userToken(uid), { type: 'deliverBounty', questId: quest.id })).status).toBe(200);
    const row = await stateRowOf(uid);
    expect(row.gold).toBe(String(Math.floor(quest.reward * 0.7)));
    expect(Object.values(row.data.items ?? {})).toEqual([1]);
  });

  it('거울이 없으면 네임드 클리어 한 번으로 그날 수주가 막힌다', async () => {
    const uid = await seed({ state: namedState() });
    await clearRow(uid);
    expect(await accept(uid, offeredNamed(uid).id)).toMatchObject({ status: 422, body: { error: 'daily-cleared' } });
  });

  it('거울을 가지면 네임드 클리어가 한 번이어도 수주하고 두 번이면 막힌다', async () => {
    const uid = await seed({ state: { ...namedState(), artifacts: ['mami-wata-mirror'] } });
    await clearRow(uid);
    expect((await accept(uid, offeredNamed(uid).id)).status).toBe(200);
    await env.client.query('delete from public.bounty_progress where user_id = $1', [uid]);
    await clearRow(uid);
    vi.setSystemTime(Date.parse(NOW) + 3000);
    expect(await accept(uid, offeredNamed(uid).id)).toMatchObject({ status: 422, body: { error: 'daily-cleared' } });
  });
});

describe('네임드가 둘인 구역의 수주', () => {
  const southState = (): Partial<GameState> => ({ dex: zoneDex('southatlantic', 'named'), location: at('walvisbay') });
  const accept = (uid: string, questId: string) =>
    callAction(userToken(uid), { type: 'acceptQuest', questId, port: 'walvisbay' });

  it.each(['southatlantic-named-adamastor', 'southatlantic-named-jasconius'])(
    '제공된 네임드 항목 %s를 어느 쪽이든 수주한다', async questId => {
      const uid = await seed({ state: southState() });
      expect((await accept(uid, questId)).status).toBe(200);
    });

  it('하루 한도는 구역 전체로 센다 — 아다마스토르를 클리어한 날에는 야스코니우스 수주도 거부한다', async () => {
    const uid = await seed({ state: southState() });
    await env.client.query('insert into public.bounty_clears (user_id, kind, quest_id, cleared_at) values ($1, $2, $3, $4)',
      [uid, 'named', 'southatlantic-named-adamastor', NOW]);
    expect(await accept(uid, 'southatlantic-named-jasconius')).toMatchObject({ status: 422, body: { error: 'daily-cleared' } });
  });

  it('다른 구역의 항구에서 낸 남대서양 네임드 수주는 거부한다', async () => {
    const uid = await seed({ state: southState() });
    const res = await callAction(userToken(uid), { type: 'acceptQuest', questId: 'southatlantic-named-jasconius', port: 'harbor' });
    expect(res.status).toBe(422);
  });
});

/** 개발 도구 판정의 호출자 종류 — 명부 계정, 명부에 없는 계정, 게스트, 명부에 올라 있어도 게스트인 계정 */
type Caller = 'admin' | 'member' | 'guest' | 'listed-guest';
let callerSeq = 0;
const seedCaller = (caller: Caller, state: object) => seed({
  state, email: caller === 'guest' || caller === 'listed-guest' ? null : `caller-${caller}-${callerSeq++}@example.test`,
  admin: caller === 'admin' || caller === 'listed-guest',
});
const CALLERS: Caller[] = ['admin', 'member', 'guest', 'listed-guest'];

describe('이사 코드 가져오기 접근 판정', () => {
  const save = { ...newState(), gold: 4321 };
  const ORIGINS = [undefined, LOCAL_ORIGIN, 'http://127.0.0.1', 'https://evil.example'];
  const importAs = async (caller: Caller, origin?: string) =>
    callAction(userToken(await seedCaller(caller, {})), { type: 'import', save }, { origin });
  const verdict = (res: { status: number; body: unknown }) => [res.status, (res.body as { error?: string }).error ?? 'ok'];

  it('운영은 명부 계정도 Origin과 무관하게 거부한다', async () => {
    process.env.DEPLOY_ENV = 'production';
    for (const caller of CALLERS) {
      for (const origin of ORIGINS) expect(verdict(await importAs(caller, origin))).toEqual([403, 'import-disabled']);
    }
  });

  it('스테이징은 명부 계정만 허용하고 Origin을 속여도 나머지는 거부한다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    for (const origin of ORIGINS) {
      expect(verdict(await importAs('admin', origin))).toEqual([200, 'ok']);
      for (const caller of ['member', 'guest', 'listed-guest'] as const) {
        expect(verdict(await importAs(caller, origin))).toEqual([403, 'import-owner-only']);
      }
    }
  });

  it('로컬 명시 값은 Origin과 무관하게 허용한다', async () => {
    process.env.DEPLOY_ENV = 'local';
    for (const origin of ORIGINS) expect(verdict(await importAs('member', origin))).toEqual([200, 'ok']);
  });

  it('환경 값이 없거나 모르는 값이면 거부한다', async () => {
    for (const env of [undefined, 'development']) {
      if (env === undefined) delete process.env.DEPLOY_ENV; else process.env.DEPLOY_ENV = env;
      for (const caller of CALLERS) {
        expect(verdict(await importAs(caller, LOCAL_ORIGIN))).toEqual([403, 'import-disabled']);
      }
    }
  });
});

describe('개발 명령 허용 판정', () => {
  const debugVerdict = (res: { status: number; body: unknown }) => [res.status, (res.body as { error?: string }).error ?? 'ok'];
  const debugAs = async (caller: Caller, origin?: string) => {
    const uid = await seedCaller(caller, {});
    return callAction(userToken(uid), { type: 'debug', command: 'stats.set', args: { gold: 1000 } }, { origin });
  };
  // 강제 조우가 받아들여지면 진행 중인 네임드의 도전권이 발급된다
  const ticketsAfterForcedCatch = async (caller: Caller, origin?: string) => {
    const uid = await seedCaller(caller, { boat: 1 });
    const named = offeredQuestsFor('pacific', 'named', uid, TODAY_KST)[0];
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good', forceEncounter: true }, { origin });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const tickets = await env.client.query('select count(*)::int as n from public.bounty_tickets where user_id = $1', [uid]);
    return tickets.rows[0].n as number;
  };
  const ORIGINS = [undefined, LOCAL_ORIGIN, 'http://127.0.0.1', 'https://evil.example'];

  it('스테이징에서 명부에 없는 계정과 게스트의 개발 명령은 Origin과 무관하게 거부한다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    for (const caller of ['member', 'guest', 'listed-guest'] as const) {
      for (const origin of ORIGINS) expect(debugVerdict(await debugAs(caller, origin))).toEqual([422, 'debug-forbidden']);
    }
  });

  it('스테이징에서 명부 계정은 Origin과 무관하게 개발 명령을 쓴다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    for (const origin of ORIGINS) expect(debugVerdict(await debugAs('admin', origin))).toEqual([200, 'ok']);
  });

  it('운영은 명부 계정도 Origin과 무관하게 개발 명령을 거부한다', async () => {
    process.env.DEPLOY_ENV = 'production';
    for (const caller of CALLERS) {
      for (const origin of ORIGINS) expect(debugVerdict(await debugAs(caller, origin))).toEqual([422, 'debug-forbidden']);
    }
  });

  it('로컬 명시 값은 Origin과 무관하게 모두 허용한다', async () => {
    process.env.DEPLOY_ENV = 'local';
    for (const origin of ORIGINS) expect(debugVerdict(await debugAs('guest', origin))).toEqual([200, 'ok']);
  });

  it('환경 값이 없거나 모르는 값이면 로컬 Origin이어도 거부한다', async () => {
    for (const value of [undefined, 'development']) {
      if (value === undefined) delete process.env.DEPLOY_ENV; else process.env.DEPLOY_ENV = value;
      for (const caller of CALLERS) {
        expect(debugVerdict(await debugAs(caller, LOCAL_ORIGIN))).toEqual([422, 'debug-forbidden']);
      }
    }
  });

  it('스테이징에서 명부 밖 호출자의 강제 조우는 통상 캐치로 처리한다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    for (const origin of ORIGINS) expect(await ticketsAfterForcedCatch('member', origin)).toBe(0);
    expect(await ticketsAfterForcedCatch('admin', undefined)).toBe(1);
  });
});

describe('세이브 v9 — 이관과 환불 영수증', () => {
  const LEGACY_ITEMS = { 'bait-common': 4, 'bait-rare': 2, 'energy-ginger': 3 };
  const REFUND = 4 * 25 + 2 * 200;
  const RECEIPT = { gold: REFUND, items: { 'bait-common': 4, 'bait-rare': 2 } };

  const seedV8 = (email: string | null | undefined = undefined) => seed({
    email,
    state: { v: 8, gold: 1000, items: LEGACY_ITEMS, activeBait: 'bait-rare' } as unknown as Partial<GameState>,
  });

  /** 다음 액션이 페이싱에 걸리지 않게 직전 액션 시각을 과거로 돌린다 */
  const rewind = (uid: string) =>
    env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z' where user_id = $1`, [uid]);

  const stored = async (uid: string) => {
    const { rows } = await env.client.query<{ gold: string; data: Record<string, unknown> }>(
      'select gold, data from public.saves_current where user_id = $1', [uid]);
    return { gold: Number(rows[0].gold), data: rows[0].data };
  };

  it('v8 행은 처음 불러올 때 환불 골드와 영수증이 한 번만 생기고, 다시 불러도 늘지 않는다', async () => {
    const uid = await seedV8();
    expect((await callAction(userToken(uid), { type: 'boot' })).status).toBe(200);
    const first = await stored(uid);
    expect(first.gold).toBe(1000 + REFUND);
    expect(first.data).toMatchObject({ v: 10, baitRefund: RECEIPT, items: { 'energy-ginger': 3 } });
    expect(first.data).not.toHaveProperty('activeBait');
    for (let i = 0; i < 2; i++) {
      await rewind(uid);
      expect((await callAction(userToken(uid), { type: 'boot' })).status).toBe(200);
    }
    expect(await stored(uid)).toEqual(first);
  });

  it('v9 행의 기운은 처음 불러올 때 10분의 1 단위로 한 번만 옮겨지고 다른 아이템은 그대로다', async () => {
    const uid = await seed({
      state: { v: 9, gold: 1500, items: { 'energy-common': 7, 'energy-legendary': 1, 'cook-lunch-bite': 3 } } as unknown as Partial<GameState>,
    });
    for (let i = 0; i < 3; i++) {
      await rewind(uid);
      expect((await callAction(userToken(uid), { type: 'boot' })).status).toBe(200);
      const now = await stored(uid);
      expect(now.data).toMatchObject({ v: 10, items: { 'energy-common': 70, 'energy-legendary': 10, 'cook-lunch-bite': 3 } });
    }
  });

  it('v9 행을 다시 불러도 조리, 슬롯, 기운 덮어쓰기, 영수증이 그대로다', async () => {
    const extra = {
      cooking: { id: 'cook-legacy-1', recipe: 'cook-lunch-rare', count: 2, bonus: [false, true], startedAt: '2030-03-04T04:00:00.000Z' },
      slots: { lunch: { id: 'cook-lunch-bite', endsAt: '2030-03-04T09:00:00.000Z' }, bait: null },
      energyTargets: { pond: false },
      baitRefund: RECEIPT,
    };
    const uid = await seed({ state: { gold: 1500, items: { 'energy-ginger': 3 }, ...extra } });
    for (let i = 0; i < 2; i++) {
      await rewind(uid);
      expect((await callAction(userToken(uid), { type: 'boot' })).status).toBe(200);
      const now = await stored(uid);
      expect(now.gold).toBe(1500);
      expect(now.data).toMatchObject({ v: 10, ...extra, items: { 'energy-ginger': 3 } });
    }
  });

  it('v9 행에서 캐치해도 영수증과 슬롯이 남고 골드가 다시 늘지 않는다', async () => {
    const extra = { slots: { lunch: null, bait: { id: 'cook-bait-rare', endsAt: '2030-03-04T09:00:00.000Z' } }, baitRefund: RECEIPT };
    const uid = await seed({ state: { gold: 1500, ...extra } });
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' });
    expect(res.status).toBe(200);
    const now = await stored(uid);
    expect(now.gold).toBe(1500);
    expect(now.data).toMatchObject({ v: 10, ...extra });
  });

  it('dismissBaitRefund는 영수증만 지우고 골드는 그대로 둔다', async () => {
    const uid = await seedV8();
    const res = await callAction(userToken(uid), { type: 'dismissBaitRefund' });
    expect(res.status).toBe(200);
    const after = await stored(uid);
    expect(after.gold).toBe(1000 + REFUND);
    expect(after.data).toMatchObject({ v: 10, baitRefund: null });
    await rewind(uid);
    expect((await callAction(userToken(uid), { type: 'dismissBaitRefund' })).status).toBe(200);
    expect(await stored(uid)).toEqual(after);
  });

  it('게스트도 dismissBaitRefund를 보낼 수 있다', async () => {
    const uid = await seedV8(null);
    const res = await callAction(userToken(uid), { type: 'dismissBaitRefund' });
    expect(res.status).toBe(200);
    const after = await stored(uid);
    expect(after.gold).toBe(1000 + REFUND);
    expect(after.data).toMatchObject({ baitRefund: null });
  });

  it('없어진 buyBait와 setActiveBait는 형식 오류로 거부한다', async () => {
    const uid = await seed({ state: { gold: 10_000 } });
    const buy = await callAction(userToken(uid), { type: 'buyBait', bait: 'bait-rare', count: 1 });
    await rewind(uid);
    const equip = await callAction(userToken(uid), { type: 'setActiveBait', bait: 'bait-rare' });
    expect([buy.status, equip.status]).toEqual([400, 400]);
    expect((await stored(uid)).gold).toBe(10_000);
  });
});

describe('없는 이동 목적지', () => {
  const rewind = (uid: string) =>
    env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z' where user_id = $1`, [uid]);
  const locationOf = async (uid: string) =>
    (await env.client.query("select data -> 'location' as v from public.saves_current where user_id = $1", [uid])).rows[0].v as unknown;

  it('콘텐츠에 없는 지역·거점 id는 422로 거부하고 위치를 그대로 둔다', async () => {
    const uid = await seed({ state: { boat: 1 } });
    const before = await locationOf(uid);
    expect(await callAction(userToken(uid), { type: 'travel', to: { kind: 'region', id: 'ocean' } }))
      .toMatchObject({ status: 422, body: { error: 'bad-request' } });
    await rewind(uid);
    expect(await callAction(userToken(uid), { type: 'travel', to: { kind: 'base', id: 'nowhere' } }))
      .toMatchObject({ status: 422, body: { error: 'bad-request' } });
    expect(await locationOf(uid)).toEqual(before);
  });
});

// 파일 끝에 둔다 — 위 스냅샷 테스트의 testUid 시드 순번을 밀지 않는다. 신규 스냅샷 없이 저장 행·버전·이벤트를 명시 단언한다.
describe('재화 액션 동시성 경합과 409 버전 충돌', () => {
  interface SavedRow {
    gold: string;
    fame: string;
    boat: number;
    rod: number;
    version: string;
    data: {
      items?: Record<string, number>;
      cooking?: { recipe: string; count: number; bonus: boolean[]; startedAt: string } | null;
      slots?: { lunch: { id: string; endsAt: string } | null; bait: { id: string; endsAt: string } | null };
      artifacts?: string[];
      artifactLevels?: Record<string, number>;
      hats?: string[];
      coupons?: string[];
      achievements?: Record<string, 'claimable' | 'claimed'>;
    };
  }

  const readSave = async (uid: string): Promise<SavedRow> =>
    (await env.client.query<SavedRow>(
      'select gold, fame, boat, rod, version, data from public.saves_current where user_id = $1', [uid],
    )).rows[0];

  const readEvents = async (uid: string): Promise<{ type: string; payload: Record<string, unknown> }[]> =>
    (await env.client.query<{ type: string; payload: Record<string, unknown> }>(
      'select type, payload from public.events where user_id = $1 order by id', [uid],
    )).rows;

  const readFishUids = async (uid: string): Promise<string[]> =>
    (await env.client.query<{ uid: string }>(
      'select uid from public.fish_instances where user_id = $1 order by uid', [uid],
    )).rows.map(r => r.uid);

  const rewind = (uid: string) =>
    env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z' where user_id = $1`, [uid]);

  /** 다른 커넥션이 saves_current 행 잠금을 쥔 채 버전을 올려, 확정 문장 실행 직후 409 version-conflict가 나게 만든다 */
  async function conflictDuringCommit(uid: string, action: unknown) {
    const blocker = new Client({ connectionString: env.db.url });
    await blocker.connect();
    let committed = false;
    let settled = false;
    try {
      await blocker.query('begin');
      await blocker.query('update public.saves_current set version = version + 1 where user_id = $1', [uid]);
      const actionPromise = callAction(userToken(uid), action);
      void actionPromise.then(() => { settled = true; }, () => { settled = true; });
      const releaseBlocker = (async () => {
        for (let i = 0; i < 300; i++) {
          if (settled) break;
          const waiting = await env.client.query(
            `select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%saves_current%'`,
          );
          if (waiting.rowCount) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        await blocker.query('commit');
        committed = true;
      })();
      const [res] = await Promise.all([actionPromise, releaseBlocker]);
      return res;
    } finally {
      if (!committed) await blocker.query('rollback').catch(() => undefined);
      await blocker.end().catch(() => undefined);
    }
  }

  describe('동일 사용자 동시 요청 경합', () => {
    it('sell 동시 요청은 한 번만 확정되고 골드·개체 삭제·sell 이벤트가 이중 적용되지 않는다', async () => {
      const sold = fish('carp', { size: 30 });
      const kept = fish('crucian', { size: 20 });
      const uid = await seed({ state: { gold: 100, bag: [sold, kept], fortune: { day: TODAY_KST, kind: 'fish', index: 3 } } });
      const expectedGold = sellSelected({ ...newState(), gold: 100, bag: [sold, kept] }, [sold.uid]).gold;

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'sell', uids: [sold.uid] }),
        callAction(userToken(uid), { type: 'sell', uids: [sold.uid] }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      // 느림 창 대상이 아니라 간격 검사가 없다 — 진 쪽도 앞 확정을 읽었으면 빈 판매(no-op)로 200, 읽기가 겹쳤으면 409다
      expect([200, 409]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(Number(save.gold)).toBe(expectedGold);
      expect([3, 4]).toContain(Number(save.version));
      expect(await readFishUids(uid)).toEqual([kept.uid]);
      const events = await readEvents(uid);
      // 실제로 개체가 팔린 판매는 한 번이다 — 빈 판매 no-op은 골드 0·0건 이벤트만 남긴다
      const soldEvents = events.filter(e => e.type === 'sell' && e.payload.count === 1);
      expect(soldEvents).toHaveLength(1);
      expect(soldEvents[0].payload).toMatchObject({ gold: expectedGold - 100, uids: [sold.uid] });
    });

    it('buyBoat 동시 요청은 1단계만 구매되고 골드·배 단계·buyBoat 이벤트가 한 번만 기록된다', async () => {
      // 골드를 첫 단계 값만 두어 진 쪽이 앞 확정을 읽어도 다음 단계를 살 수 없게 한다
      const uid = await seed({ state: { boat: 0, gold: BOATS[0].price, fame: 500 } });
      const tier1Price = BOATS[0].price;

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'buyBoat' }),
        callAction(userToken(uid), { type: 'buyBoat' }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(save.boat).toBe(1);
      expect(Number(save.gold)).toBe(0);
      expect(Number(save.version)).toBe(3);
      const events = await readEvents(uid);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'buyBoat', payload: { tier: 1, cost: tier1Price } });
    });

    it('upgradeRod 동시 요청은 1회만 강화되고 골드·강화 단계·upgradeRod 이벤트가 한 번만 기록된다', async () => {
      const cost = upgradeCost(1);
      // 골드를 1회 강화 값만 두어 진 쪽이 앞 확정을 읽어도 다시 강화할 수 없게 한다
      const uid = await seed({ state: { rod: 1, gold: cost } });

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'upgradeRod' }),
        callAction(userToken(uid), { type: 'upgradeRod' }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(save.rod).toBe(2);
      expect(Number(save.gold)).toBe(0);
      expect(Number(save.version)).toBe(3);
      const events = await readEvents(uid);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'upgradeRod', payload: { toLevel: 2, cost } });
    });

    it('cook 동시 요청은 기운을 한 번만 차감하고 조리 상태와 cook 이벤트를 한 번만 남긴다', async () => {
      const recipe = recipeById('cook-lunch-rare')!;
      const commonCost = recipeCostStored(recipe, 'common');
      const rareCost = recipeCostStored(recipe, 'rare');
      const uid = await seed({
        state: {
          boat: COOKING_UNLOCK_BOAT,
          location: at('home'),
          items: { [ENERGY_ITEM_IDS.common]: commonCost, [ENERGY_ITEM_IDS.rare]: rareCost },
        },
      });

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'cook', recipe: recipe.id, count: 1 }),
        callAction(userToken(uid), { type: 'cook', recipe: recipe.id, count: 1 }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(save.data.items).toEqual({});
      expect(save.data.cooking).toMatchObject({ recipe: recipe.id, count: 1, startedAt: NOW });
      expect(Number(save.version)).toBe(3);
      const events = await readEvents(uid);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'cook', payload: { recipe: recipe.id, count: 1 } });
    });

    it('eat 동시 요청은 요리를 1개만 소모하고 슬롯과 eat 이벤트를 한 번만 기록한다', async () => {
      // 요리를 1개만 두어 진 쪽이 앞 확정을 읽어도 다시 먹을 수 없게 한다
      const uid = await seed({
        state: { boat: COOKING_UNLOCK_BOAT, items: { 'cook-lunch-bite': 1 } },
      });

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'eat', item: 'cook-lunch-bite' }),
        callAction(userToken(uid), { type: 'eat', item: 'cook-lunch-bite' }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(save.data.items).toEqual({});
      expect(save.data.slots?.lunch?.id).toBe('cook-lunch-bite');
      expect(Number(save.version)).toBe(3);
      const events = await readEvents(uid);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'eat', payload: { item: 'cook-lunch-bite' } });
    });

    it('extractEnergy 동시 요청은 개체를 한 번만 소비하고 기운·extractEnergy 이벤트를 한 번만 남긴다', async () => {
      const target = fish('crucian');
      const kept = fish('carp');
      const uid = await seed({
        state: { boat: COOKING_UNLOCK_BOAT, location: at('home'), bag: [target, kept] },
      });

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'extractEnergy', uids: [target.uid] }),
        callAction(userToken(uid), { type: 'extractEnergy', uids: [target.uid] }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      // 느림 창 대상이 아니라 간격 검사가 없다 — 진 쪽도 앞 확정을 읽었으면 개체가 없어 no-op으로 200, 읽기가 겹쳤으면 409다
      expect([200, 409]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(save.data.items).toEqual({ [ENERGY_ITEM_IDS.common]: ENERGY_PER_INDIVIDUAL });
      expect([3, 4]).toContain(Number(save.version));
      expect(await readFishUids(uid)).toEqual([kept.uid]);
      const events = await readEvents(uid);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('extractEnergy');
      expect(events[0].payload).toMatchObject({ uids: [target.uid] });
    });

    it('exchangeArtifact 동시 요청은 재료를 1개만 소모하고 유물과 exchangeArtifact 이벤트를 한 번만 기록한다', async () => {
      const art = artifactById('abyss-angler')!;
      const uid = await seed({ state: { items: { [art.materialId]: 2 } } });

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'exchangeArtifact', artifact: art.id }),
        callAction(userToken(uid), { type: 'exchangeArtifact', artifact: art.id }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      // 느림 창 대상이 아니라 간격 검사가 없다 — 진 쪽도 앞 확정을 읽었으면 이미 가진 유물이라 멱등 200, 읽기가 겹쳤으면 409다
      expect([200, 409]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(save.data.artifacts).toEqual([art.id]);
      expect(save.data.items).toEqual({ [art.materialId]: 1 });
      expect([3, 4]).toContain(Number(save.version));
      const events = await readEvents(uid);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'exchangeArtifact', payload: { artifact: art.id } });
    });

    it('levelUpArtifact 동시 요청은 레벨을 1만 올리고 재료와 levelUpArtifact 이벤트를 한 번만 기록한다', async () => {
      const art = artifactById('wreck-compass')!;
      const costLv2 = artifactLevelCost(2);
      // 재료를 1회 레벨업 값만 두어 진 쪽이 앞 확정을 읽어도 다음 레벨을 올릴 수 없게 한다
      const uid = await seed({
        state: { artifacts: [art.id], items: { [art.materialId]: costLv2 } },
      });

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'levelUpArtifact', artifact: art.id }),
        callAction(userToken(uid), { type: 'levelUpArtifact', artifact: art.id }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(save.data.artifactLevels).toEqual({ [art.id]: 2 });
      expect(save.data.items).toEqual({});
      expect(Number(save.version)).toBe(3);
      const events = await readEvents(uid);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'levelUpArtifact', payload: { artifact: art.id, level: 2 } });
    });

    it('buyHat 동시 요청은 골드를 한 번만 차감하고 모자와 buyHat 이벤트를 한 번만 기록한다', async () => {
      const hat = hatById('cap-red')!;
      const uid = await seed({ state: { gold: hat.price * 2 } });

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'buyHat', hat: hat.id }),
        callAction(userToken(uid), { type: 'buyHat', hat: hat.id }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(Number(save.gold)).toBe(hat.price);
      expect(save.data.hats).toEqual([hat.id]);
      expect(Number(save.version)).toBe(3);
      const events = await readEvents(uid);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'buyHat', payload: { hat: hat.id, cost: hat.price } });
    });

    it('redeemCoupon 동시 요청은 한 번만 적용되고 골드·사용 쿠폰·coupon 이벤트가 한 번만 기록된다', async () => {
      await env.client.query(`insert into public.coupons (code, gold, description, active)
        values ('DYN-CONC-1', 777, '동시 테스트', true)`);
      const uid = await seed({ state: { gold: 100 } });

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'redeemCoupon', code: 'DYN-CONC-1' }),
        callAction(userToken(uid), { type: 'redeemCoupon', code: 'DYN-CONC-1' }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(Number(save.gold)).toBe(877);
      expect(save.data.coupons).toEqual(['DYN-CONC-1']);
      expect(Number(save.version)).toBe(3);
      const events = await readEvents(uid);
      expect(events).toEqual([{ type: 'coupon', payload: { code: 'DYN-CONC-1', gold: 777 } }]);
    });

    it('claimAchievement 동시 요청은 보상을 한 번만 지급하고 업적 상태와 claimAchievement 이벤트를 한 번만 기록한다', async () => {
      const def = achievementById('spot-basic-sea')!;
      expect(def.reward.kind).toBe('gold');
      const rewardGold = def.reward.kind === 'gold' ? def.reward.gold : 0;
      const uid = await seed({ state: { gold: 100, achievements: { [def.id]: 'claimable' } } });

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'claimAchievement', id: def.id }),
        callAction(userToken(uid), { type: 'claimAchievement', id: def.id }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(Number(save.gold)).toBe(100 + rewardGold);
      expect(save.data.achievements).toEqual({ [def.id]: 'claimed' });
      expect(Number(save.version)).toBe(3);
      const events = await readEvents(uid);
      expect(events).toEqual([{ type: 'claimAchievement', payload: { id: def.id, gold: rewardGold } }]);
    });

    it('claimAllAchievements 동시 요청은 보상을 한 번만 일괄 지급하고 claimAllAchievements 이벤트를 한 번만 기록한다', async () => {
      const goldDef = achievementById('spot-basic-sea')!;
      const hatDef = achievementById('variant-village')!;
      const rewardGold = goldDef.reward.kind === 'gold' ? goldDef.reward.gold : 0;
      const rewardHat = hatDef.reward.kind === 'hat' ? hatDef.reward.hatId : '';
      const uid = await seed({
        state: { gold: 100, achievements: { [goldDef.id]: 'claimable', [hatDef.id]: 'claimable' } },
      });

      const results = await Promise.all([
        callAction(userToken(uid), { type: 'claimAllAchievements' }),
        callAction(userToken(uid), { type: 'claimAllAchievements' }),
      ]);
      const statuses = results.map(r => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([409, 422]).toContain(statuses[1]);

      const save = await readSave(uid);
      expect(Number(save.gold)).toBe(100 + rewardGold);
      expect(save.data.hats).toEqual([rewardHat]);
      expect(save.data.achievements).toEqual({ [goldDef.id]: 'claimed', [hatDef.id]: 'claimed' });
      expect(Number(save.version)).toBe(3);
      const events = await readEvents(uid);
      expect(events).toEqual([{
        type: 'claimAllAchievements',
        payload: { ids: [goldDef.id, hatDef.id], gold: rewardGold, hats: [rewardHat] },
      }]);
    });
  });

  describe('409 version-conflict 시 DB 미기록·이중 적용 없음', () => {
    it('sell 중 버전 충돌이 나면 개체·골드·이벤트를 쓰지 않고, 재시도 시 한 번만 판매된다', async () => {
      const sold = fish('carp', { size: 30 });
      const kept = fish('crucian', { size: 20 });
      const uid = await seed({ state: { gold: 100, bag: [sold, kept], fortune: { day: TODAY_KST, kind: 'fish', index: 3 } } });
      const expectedGold = sellSelected({ ...newState(), gold: 100, bag: [sold, kept] }, [sold.uid]).gold;

      const conflict = await conflictDuringCommit(uid, { type: 'sell', uids: [sold.uid] });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      expect(Number((await readSave(uid)).gold)).toBe(100);
      expect(Number((await readSave(uid)).version)).toBe(3);
      expect(await readFishUids(uid)).toEqual([sold.uid, kept.uid].sort());
      expect(await readEvents(uid)).toEqual([]);

      await rewind(uid);
      const retry = await callAction(userToken(uid), { type: 'sell', uids: [sold.uid] });
      expect(retry.status).toBe(200);
      expect(Number((await readSave(uid)).gold)).toBe(expectedGold);
      expect(Number((await readSave(uid)).version)).toBe(4);
      expect(await readFishUids(uid)).toEqual([kept.uid]);
      expect(await readEvents(uid)).toHaveLength(1);
      expect((await readEvents(uid))[0].type).toBe('sell');
    });

    it('buyBoat 중 버전 충돌이 나면 409를 반환하고 골드·배 단계·이벤트를 기록하지 않는다', async () => {
      const uid = await seed({ state: { boat: 0, gold: 500, fame: 500 } });

      const conflict = await conflictDuringCommit(uid, { type: 'buyBoat' });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      const save = await readSave(uid);
      expect(save.boat).toBe(0);
      expect(Number(save.gold)).toBe(500);
      expect(Number(save.version)).toBe(3);
      expect(await readEvents(uid)).toEqual([]);
    });

    it('cook 중 버전 충돌이 나면 409를 반환하고 기운 차감·조리 상태·이벤트를 기록하지 않는다', async () => {
      const recipe = recipeById('cook-bait-rare')!;
      const commonCost = recipeCostStored(recipe, 'common');
      const rareCost = recipeCostStored(recipe, 'rare');
      const uid = await seed({
        state: {
          boat: COOKING_UNLOCK_BOAT,
          location: at('home'),
          items: { [ENERGY_ITEM_IDS.common]: commonCost, [ENERGY_ITEM_IDS.rare]: rareCost },
        },
      });

      const conflict = await conflictDuringCommit(uid, { type: 'cook', recipe: recipe.id, count: 1 });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      const save = await readSave(uid);
      expect(save.data.items).toEqual({ [ENERGY_ITEM_IDS.common]: commonCost, [ENERGY_ITEM_IDS.rare]: rareCost });
      expect(save.data.cooking).toBeNull();
      expect(Number(save.version)).toBe(3);
      expect(await readEvents(uid)).toEqual([]);
    });

    it('extractEnergy 중 버전 충돌이 나면 409를 반환하고 개체 삭제·기운 적립·이벤트를 기록하지 않는다', async () => {
      const target = fish('crucian');
      const uid = await seed({
        state: { boat: COOKING_UNLOCK_BOAT, location: at('home'), bag: [target] },
      });

      const conflict = await conflictDuringCommit(uid, { type: 'extractEnergy', uids: [target.uid] });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      const save = await readSave(uid);
      expect(save.data.items).toEqual({});
      expect(Number(save.version)).toBe(3);
      expect(await readFishUids(uid)).toEqual([target.uid]);
      expect(await readEvents(uid)).toEqual([]);
    });

    it('exchangeArtifact 중 버전 충돌이 나면 409를 반환하고 재료·유물·이벤트를 기록하지 않으며, 재시도 시 한 번만 교환한다', async () => {
      const art = artifactById('abyss-angler')!;
      const uid = await seed({ state: { items: { [art.materialId]: 2 } } });

      const conflict = await conflictDuringCommit(uid, { type: 'exchangeArtifact', artifact: art.id });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      const afterConflict = await readSave(uid);
      expect(afterConflict.data.artifacts).toEqual([]);
      expect(afterConflict.data.items).toEqual({ [art.materialId]: 2 });
      expect(Number(afterConflict.version)).toBe(3);
      expect(await readEvents(uid)).toEqual([]);

      await rewind(uid);
      const retry = await callAction(userToken(uid), { type: 'exchangeArtifact', artifact: art.id });
      expect(retry.status).toBe(200);
      const afterRetry = await readSave(uid);
      expect(afterRetry.data.artifacts).toEqual([art.id]);
      expect(afterRetry.data.items).toEqual({ [art.materialId]: 1 });
      expect(Number(afterRetry.version)).toBe(4);
      expect(await readEvents(uid)).toEqual([{ type: 'exchangeArtifact', payload: { artifact: art.id } }]);
    });

    it('levelUpArtifact 중 버전 충돌이 나면 409를 반환하고 재료·레벨·이벤트를 기록하지 않는다', async () => {
      const art = artifactById('wreck-compass')!;
      const costLv2 = artifactLevelCost(2);
      const uid = await seed({
        state: { artifacts: [art.id], items: { [art.materialId]: costLv2 } },
      });

      const conflict = await conflictDuringCommit(uid, { type: 'levelUpArtifact', artifact: art.id });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      const save = await readSave(uid);
      expect(save.data.artifactLevels).toBeUndefined();
      expect(save.data.items).toEqual({ [art.materialId]: costLv2 });
      expect(Number(save.version)).toBe(3);
      expect(await readEvents(uid)).toEqual([]);
    });

    it('buyHat 중 버전 충돌이 나면 409를 반환하고 골드·모자·이벤트를 기록하지 않는다', async () => {
      const hat = hatById('cap-red')!;
      const uid = await seed({ state: { gold: hat.price } });

      const conflict = await conflictDuringCommit(uid, { type: 'buyHat', hat: hat.id });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      const save = await readSave(uid);
      expect(Number(save.gold)).toBe(hat.price);
      expect(save.data.hats).toEqual([]);
      expect(Number(save.version)).toBe(3);
      expect(await readEvents(uid)).toEqual([]);
    });

    it('eat 중 버전 충돌이 나면 409를 반환하고 요리 소모·슬롯·이벤트를 기록하지 않는다', async () => {
      const uid = await seed({
        state: { boat: COOKING_UNLOCK_BOAT, items: { 'cook-lunch-bite': 2 } },
      });

      const conflict = await conflictDuringCommit(uid, { type: 'eat', item: 'cook-lunch-bite' });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      const save = await readSave(uid);
      expect(save.data.items).toEqual({ 'cook-lunch-bite': 2 });
      expect(save.data.slots?.lunch).toBeNull();
      expect(Number(save.version)).toBe(3);
      expect(await readEvents(uid)).toEqual([]);
    });

    it('claimMail 중 버전 충돌이 나면 409를 반환하고 골드·우편 수령 시각·이벤트를 기록하지 않으며, 재시도 시 한 번만 받는다', async () => {
      const uid = await seed({ state: { gold: 1000 } });
      const { rows } = await env.client.query<{ id: string }>(
        `insert into public.mails (user_id, title, body, gold) values ($1, '충돌우편', '본문', 500) returning id`, [uid]);
      const id = Number(rows[0].id);

      const conflict = await conflictDuringCommit(uid, { type: 'claimMail', id });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      const afterConflict = await readSave(uid);
      expect(Number(afterConflict.gold)).toBe(1000);
      expect(Number(afterConflict.version)).toBe(3);
      const mailAfterConflict = await env.client.query<{ claimed_at: Date | null; read_at: Date | null }>(
        'select claimed_at, read_at from public.mails where id = $1', [id]);
      expect(mailAfterConflict.rows[0]).toEqual({ claimed_at: null, read_at: null });
      expect(await readEvents(uid)).toEqual([]);

      await rewind(uid);
      const retry = await callAction(userToken(uid), { type: 'claimMail', id });
      expect(retry.status).toBe(200);
      const afterRetry = await readSave(uid);
      expect(Number(afterRetry.gold)).toBe(1500);
      expect(Number(afterRetry.version)).toBe(4);
      const mailAfterRetry = await env.client.query<{ claimed_at: Date | null; read_at: Date | null }>(
        'select claimed_at, read_at from public.mails where id = $1', [id]);
      expect(mailAfterRetry.rows[0].claimed_at).not.toBeNull();
      expect(mailAfterRetry.rows[0].read_at).not.toBeNull();
      expect(await readEvents(uid)).toEqual([{ type: 'claimMail', payload: { mailId: id, gold: 500 } }]);
    });

    it('redeemCoupon 중 버전 충돌이 나면 409를 반환하고 골드·쿠폰 사용·이벤트를 기록하지 않으며, 재시도 시 한 번만 적용된다', async () => {
      await env.client.query(`insert into public.coupons (code, gold, description, active)
        values ('DYN-CONFLICT-1', 777, '충돌 테스트', true)`);
      const uid = await seed({ state: { gold: 100 } });

      const conflict = await conflictDuringCommit(uid, { type: 'redeemCoupon', code: 'DYN-CONFLICT-1' });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      const afterConflict = await readSave(uid);
      expect(Number(afterConflict.gold)).toBe(100);
      expect(afterConflict.data.coupons).toEqual([]);
      expect(Number(afterConflict.version)).toBe(3);
      expect(await readEvents(uid)).toEqual([]);

      await rewind(uid);
      const retry = await callAction(userToken(uid), { type: 'redeemCoupon', code: 'DYN-CONFLICT-1' });
      expect(retry.status).toBe(200);
      const afterRetry = await readSave(uid);
      expect(Number(afterRetry.gold)).toBe(877);
      expect(afterRetry.data.coupons).toEqual(['DYN-CONFLICT-1']);
      expect(Number(afterRetry.version)).toBe(4);
      expect(await readEvents(uid)).toEqual([{ type: 'coupon', payload: { code: 'DYN-CONFLICT-1', gold: 777 } }]);
    });

    it('claimAchievement 중 버전 충돌이 나면 409를 반환하고 골드·업적 상태·이벤트를 기록하지 않으며, 재시도 시 한 번만 수령된다', async () => {
      const def = achievementById('spot-basic-sea')!;
      const rewardGold = def.reward.kind === 'gold' ? def.reward.gold : 0;
      const uid = await seed({ state: { gold: 100, achievements: { [def.id]: 'claimable' } } });

      const conflict = await conflictDuringCommit(uid, { type: 'claimAchievement', id: def.id });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      const afterConflict = await readSave(uid);
      expect(Number(afterConflict.gold)).toBe(100);
      expect(afterConflict.data.achievements).toEqual({ [def.id]: 'claimable' });
      expect(Number(afterConflict.version)).toBe(3);
      expect(await readEvents(uid)).toEqual([]);

      await rewind(uid);
      const retry = await callAction(userToken(uid), { type: 'claimAchievement', id: def.id });
      expect(retry.status).toBe(200);
      const afterRetry = await readSave(uid);
      expect(Number(afterRetry.gold)).toBe(100 + rewardGold);
      expect(afterRetry.data.achievements).toEqual({ [def.id]: 'claimed' });
      expect(Number(afterRetry.version)).toBe(4);
      expect(await readEvents(uid)).toEqual([{ type: 'claimAchievement', payload: { id: def.id, gold: rewardGold } }]);
    });

    it('claimAllAchievements 중 버전 충돌이 나면 409를 반환하고 보상·업적 상태·이벤트를 기록하지 않으며, 재시도 시 한 번만 수령된다', async () => {
      const goldDef = achievementById('spot-basic-sea')!;
      const hatDef = achievementById('variant-village')!;
      const rewardGold = goldDef.reward.kind === 'gold' ? goldDef.reward.gold : 0;
      const rewardHat = hatDef.reward.kind === 'hat' ? hatDef.reward.hatId : '';
      const uid = await seed({
        state: { gold: 100, achievements: { [goldDef.id]: 'claimable', [hatDef.id]: 'claimable' } },
      });

      const conflict = await conflictDuringCommit(uid, { type: 'claimAllAchievements' });
      expect(conflict).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
      const afterConflict = await readSave(uid);
      expect(Number(afterConflict.gold)).toBe(100);
      expect(afterConflict.data.hats).toEqual([]);
      expect(afterConflict.data.achievements).toEqual({ [goldDef.id]: 'claimable', [hatDef.id]: 'claimable' });
      expect(Number(afterConflict.version)).toBe(3);
      expect(await readEvents(uid)).toEqual([]);

      await rewind(uid);
      const retry = await callAction(userToken(uid), { type: 'claimAllAchievements' });
      expect(retry.status).toBe(200);
      const afterRetry = await readSave(uid);
      expect(Number(afterRetry.gold)).toBe(100 + rewardGold);
      expect(afterRetry.data.hats).toEqual([rewardHat]);
      expect(afterRetry.data.achievements).toEqual({ [goldDef.id]: 'claimed', [hatDef.id]: 'claimed' });
      expect(Number(afterRetry.version)).toBe(4);
      expect(await readEvents(uid)).toEqual([{
        type: 'claimAllAchievements',
        payload: { ids: [goldDef.id, hatDef.id], gold: rewardGold, hats: [rewardHat] },
      }]);
    });
  });
});

describe('네임드 토벌 단일 기록과 일일 상한', () => {
  it('네임드 결투 승리와 납품 연쇄는 bounty_clears에 1행만 남기고 마미 와타의 거울 보유 시 같은 날 2번째 네임드 수주를 허용한다', async () => {
    const uid = await seed({
      state: {
        boat: 6,
        dex: zoneDex('southatlantic', 'named'),
        location: at('walvisbay'),
        artifacts: ['mami-wata-mirror'],
      },
    });
    const first = BOUNTIES.find(q => q.id === 'southatlantic-named-adamastor')!;
    const second = BOUNTIES.find(q => q.id === 'southatlantic-named-jasconius')!;
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, first.zone, first.id, NOW]);
    await env.client.query('insert into public.bounty_tickets (user_id, quest_id, issued_at) values ($1, $2, $3)',
      [uid, first.id, NOW]);

    const duel = await callAction(userToken(uid), { type: 'resolveChallenge', questId: first.id, success: true, hits: 99, misses: 0 });
    expect(duel.status).toBe(200);
    vi.setSystemTime(Date.parse(NOW) + 2000);
    const deliver = await callAction(userToken(uid), { type: 'deliverBounty', questId: first.id });
    expect(deliver.status).toBe(200);

    const clears = await env.client.query<{ quest_id: string }>(
      `select quest_id from public.bounty_clears where user_id = $1 and kind = 'named'`, [uid]);
    expect(clears.rows.map(r => r.quest_id)).toEqual([first.id]);

    vi.setSystemTime(Date.parse(NOW) + 4000);
    const nextAccept = await callAction(userToken(uid), { type: 'acceptQuest', questId: second.id, port: 'walvisbay' });
    expect(nextAccept.status).toBe(200);
  });
});

describe('오늘의 운세', () => {
  const storedFortune = async (uid: string) => {
    const { rows } = await env.client.query<{ version: string; gold: string; data: GameState }>(
      'select version, gold, data from public.saves_current where user_id = $1', [uid],
    );
    return { version: Number(rows[0].version), gold: Number(rows[0].gold), fortune: rows[0].data.fortune };
  };

  it('boot 첫 접속 시 오늘의 운세를 고정해 저장하고, 같은 게임 날짜 내 재접속(04:00 경계 전)에는 바뀌지 않는다', async () => {
    const uid = await seed({ state: { fortune: null } });

    const firstRes = await callAction(userToken(uid), { type: 'boot', buildId: 'dev' });
    expect(firstRes.status).toBe(200);
    const firstScalars = (firstRes.body as { patch: { scalars: { fortune: DailyFortune | null } } }).patch.scalars;
    const firstSaved = await storedFortune(uid);
    expect(firstSaved.version).toBe(3);
    expect(firstSaved.fortune).toEqual({
      day: TODAY_KST,
      kind: expect.toBeOneOf(ALL_FORTUNE_KINDS),
      index: expect.toBeOneOf([3, 5]),
    });
    expect(firstScalars.fortune).toEqual(firstSaved.fortune);

    // 같은 게임 날짜의 마지막 시각(KST 03:59:59)에 재접속해도 운세는 그대로다
    vi.setSystemTime(new Date('2030-03-04T18:59:59.000Z'));
    const sameDayRes = await callAction(userToken(uid), { type: 'boot', buildId: 'dev' });
    expect(sameDayRes.status).toBe(200);
    const sameDayScalars = (sameDayRes.body as { patch: { scalars: { fortune: DailyFortune | null } } }).patch.scalars;
    const sameDaySaved = await storedFortune(uid);
    expect(sameDaySaved.version).toBe(4);
    expect(sameDaySaved.fortune).toEqual(firstSaved.fortune);
    expect(sameDayScalars.fortune).toEqual(firstSaved.fortune);
  });

  it('게임 날짜 경계(한국 시각 04:00) 이후 boot 시 새 게임 날짜의 운세로 갱신해 저장한다', async () => {
    const uid = await seed({ state: { fortune: { day: TODAY_KST, kind: 'fish', index: 3 } } });

    // KST 2030-03-05 04:00:00 — 새 게임 날짜 '2030-03-05' 시작
    vi.setSystemTime(new Date('2030-03-04T19:00:00.000Z'));
    const nextDayRes = await callAction(userToken(uid), { type: 'boot', buildId: 'dev' });
    expect(nextDayRes.status).toBe(200);
    const nextDayScalars = (nextDayRes.body as { patch: { scalars: { fortune: DailyFortune | null } } }).patch.scalars;
    const nextDaySaved = await storedFortune(uid);
    expect(nextDaySaved.version).toBe(3);
    expect(nextDaySaved.fortune).toEqual({
      day: '2030-03-05',
      kind: expect.toBeOneOf(ALL_FORTUNE_KINDS),
      index: expect.toBeOneOf([3, 5]),
    });
    expect(nextDayScalars.fortune).toEqual(nextDaySaved.fortune);
  });

  it('boot 없이 빠른 경로 catch를 호출해도 백스톱으로 오늘의 운세를 고정해 저장한다', async () => {
    const uid = await seed({ state: { fortune: null }, version: 2 });

    const res = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'good' });
    expect(res.status).toBe(200);
    const scalars = (res.body as { patch: { scalars: { fortune: DailyFortune | null } } }).patch.scalars;
    const saved = await storedFortune(uid);
    expect(saved.version).toBe(3);
    expect(saved.fortune).toEqual({
      day: TODAY_KST,
      kind: expect.toBeOneOf(ALL_FORTUNE_KINDS),
      index: expect.toBeOneOf([3, 5]),
    });
    expect(scalars.fortune).toEqual(saved.fortune);
  });

  it('boot 없이 sell을 호출해도 백스톱으로 운세를 고정하고 재물운 배율을 판매가에 반영한다', async () => {
    const soldNoBoot = fish('carp', { size: 30, uid: testUid(9501) });
    const uidNoBoot = await seed({ state: { fortune: null, bag: [soldNoBoot] } });

    const noBootRes = await callAction(userToken(uidNoBoot), { type: 'sell', uids: [soldNoBoot.uid] });
    expect(noBootRes.status).toBe(200);
    const noBootScalars = (noBootRes.body as { patch: { scalars: { fortune: DailyFortune | null } } }).patch.scalars;
    const noBootSaved = await storedFortune(uidNoBoot);
    expect(noBootSaved.version).toBe(3);
    expect(noBootSaved.fortune).toEqual({
      day: TODAY_KST,
      kind: expect.toBeOneOf(ALL_FORTUNE_KINDS),
      index: expect.toBeOneOf([3, 5]),
    });
    expect(noBootScalars.fortune).toEqual(noBootSaved.fortune);

    // 재물운 지수 5(×1.05)가 고정된 날에는 판매가가 +5%p 올라 저장된다
    const soldGoldDay = fish('carp', { size: 30, uid: testUid(9502) });
    const goldFortune: DailyFortune = { day: TODAY_KST, kind: 'gold', index: 5 };
    const uidGoldDay = await seed({ state: { fortune: goldFortune, bag: [soldGoldDay] } });
    const expectedGold = sellSelected(
      { ...newState(), bag: [soldGoldDay], fortune: goldFortune },
      [soldGoldDay.uid],
      0,
      luckMultOf(goldFortune, 'sell'),
    ).gold;

    const goldDayRes = await callAction(userToken(uidGoldDay), { type: 'sell', uids: [soldGoldDay.uid] });
    expect(goldDayRes.status).toBe(200);
    const goldDaySaved = await storedFortune(uidGoldDay);
    expect(goldDaySaved.version).toBe(3);
    expect(goldDaySaved.gold).toBe(expectedGold);
    expect(goldDaySaved.fortune).toEqual(goldFortune);
  });
});

describe('밤 깊이 경계와 빠른 경로 천장 조회', () => {
  it('밤 시작(22:00, nightDepth=0) 경계에서 빠른 경로 catch는 밤 어종 천장 후보를 제외해 ownedNormalForms 조회를 생략하고, 밤 정점(02:00)에서는 조회·확정한다', async () => {
    const baseState: Partial<GameState> = { boat: 1, fortune: { day: TODAY_KST, kind: 'gold', index: 3 } };

    // 1) 22:00 경계(UTC :55분) — 천장 없는 기준선 DB 왕복 수 측정
    vi.setSystemTime(new Date('2030-03-04T05:55:00.000Z'));
    const uidBaseline = await seed({ state: { ...baseState, pity: {} } });
    const spy = vi.spyOn(database().db, 'execute');
    spy.mockClear();
    const resBaseline = await callAction(userToken(uidBaseline), { type: 'catch', spot: 'sea', judgment: 'auto' });
    const baselineQueries = spy.mock.calls.length;
    expect(resBaseline.status).toBe(200);

    // 2) 같은 22:00 경계에서 밤 전용 어종(moonveil)만 천장 도달 — nightDepth=0이므로 후보에서 빠져 추가 조회 없음
    const uidZero = await seed({ state: { ...baseState, pity: { moonveil: SPECIES_PITY_K } } });
    spy.mockClear();
    const resZero = await callAction(userToken(uidZero), { type: 'catch', spot: 'sea', judgment: 'auto' });
    const zeroQueries = spy.mock.calls.length;
    expect(resZero.status).toBe(200);
    expect(zeroQueries).toBe(baselineQueries);
    const zeroBody = resZero.body as { result: { type: string; fishId: string } };
    expect(zeroBody.result.fishId).not.toBe('moonveil');

    // 3) 밤 정점(02:00, UTC :05분)에서는 밤 어종 후보가 살아 있어 ownedNormalForms 1회 추가 조회 후 천장 확정
    vi.setSystemTime(new Date('2030-03-04T05:05:00.000Z'));
    const uidPeak = await seed({ state: { ...baseState, pity: { moonveil: SPECIES_PITY_K } } });
    spy.mockClear();
    const resPeak = await callAction(userToken(uidPeak), { type: 'catch', spot: 'sea', judgment: 'auto' });
    const peakQueries = spy.mock.calls.length;
    spy.mockRestore();
    expect(resPeak.status).toBe(200);
    expect(peakQueries).toBe(baselineQueries + 1);
    const peakDb = await dumpUser(env.client, uidPeak);
    const caughtPayload = (peakDb.events as { type: string; payload: Record<string, unknown> }[])
      .find(e => e.type === 'catch')?.payload;
    expect(caughtPayload).toMatchObject({ fishId: 'moonveil', form: 'normal', pity: true });
    expect((peakDb.saves_current[0] as { data: GameState }).data.pity.moonveil).toBe(PITY_DONE);
  });
});

describe('우편 아이템 첨부와 물약 사용', () => {
  it('골드가 0이고 아이템만 첨부된 우편도 수령 가능하며 저장 단위(기운 1개=10단위)로 지급되고 재수령은 422다', async () => {
    const uid = await seed({ state: { gold: 100, items: {} } });
    const items = [{ id: 'luck-small', qty: 2 }, { id: 'energy-common', qty: 3 }];
    const { rows } = await env.client.query<{ id: string }>(
      `insert into public.mails (user_id, title, body, gold, items) values ($1, '아이템', '본문', 0, $2::jsonb) returning id`,
      [uid, JSON.stringify(items)],
    );
    const id = Number(rows[0].id);

    const res = await callAction(userToken(uid), { type: 'claimMail', id });
    expect(res.status).toBe(200);
    expect((res.body as { result: unknown }).result).toEqual({ type: 'mail', gold: 0, items });

    vi.setSystemTime(Date.parse(NOW) + 2000);
    const again = await callAction(userToken(uid), { type: 'claimMail', id });
    expect(again).toMatchObject({ status: 422, body: { error: 'mail-unavailable' } });

    const db = await dumpUser(env.client, uid);
    const save = db.saves_current[0] as { gold: number; data: GameState };
    expect(Number(save.gold)).toBe(100);
    expect(save.data.items).toEqual({ 'luck-small': 2, 'energy-common': 30 });
    expect((db.events as { type: string; payload: unknown }[]).map(e => ({ type: e.type, payload: e.payload }))).toEqual([
      { type: 'claimMail', payload: { mailId: id, gold: 0, items } },
    ]);
  });

  it('usePotion은 가방 비약 1개를 소비해 오늘 게임 날짜까지 효과를 켜고 판매 가격·포획 운 배율에 독립 곱연산된다', async () => {
    const sold = fish('goldcarp', { size: 30, uid: testUid(9601) });
    const uid = await seed({
      state: {
        gold: 0,
        fortune: { day: TODAY_KST, kind: 'gold', index: 5 },
        items: { 'luck-small': 2 },
        bag: [sold],
      },
    });

    const res = await callAction(userToken(uid), { type: 'usePotion', id: 'luck-small' });
    expect(res.status).toBe(200);
    expect((res.body as { result: unknown }).result).toEqual({ type: 'none' });

    const afterUse = await dumpUser(env.client, uid);
    const saveAfterUse = afterUse.saves_current[0] as { data: GameState };
    expect(saveAfterUse.data.items).toEqual({ 'luck-small': 1 });
    expect(saveAfterUse.data.potions).toEqual({ 'luck-small': TODAY_KST });
    expect((afterUse.events as { type: string; payload: unknown }[]).map(e => ({ type: e.type, payload: e.payload }))).toEqual([
      { type: 'usePotion', payload: { id: 'luck-small', day: TODAY_KST } },
    ]);

    // 같은 날 재사용은 거부된다
    vi.setSystemTime(Date.parse(NOW) + 2000);
    const dup = await callAction(userToken(uid), { type: 'usePotion', id: 'luck-small' });
    expect(dup).toMatchObject({ status: 422, body: { error: 'potion-already-active' } });

    // 황금 저울운 ×1.10 × 작은 바다 영약 ×1.05 = ×1.155 독립 곱연산 배율이 판매가에 적용된다
    vi.setSystemTime(Date.parse(NOW) + 4000);
    const expectedGold = sellSelected(
      { ...newState(), bag: [sold], fortune: { day: TODAY_KST, kind: 'gold', index: 5 }, potions: { 'luck-small': TODAY_KST } },
      [sold.uid],
      0,
      1.10 * 1.05,
    ).gold;
    expect(expectedGold).toBe(924);
    const sellRes = await callAction(userToken(uid), { type: 'sell', uids: [sold.uid] });
    expect(sellRes.status).toBe(200);
    const saveAfterSell = (await dumpUser(env.client, uid)).saves_current[0] as { gold: number };
    expect(Number(saveAfterSell.gold)).toBe(expectedGold);
  });
});

describe('바운티 해금 완화 — 일반 즉시 개방·네임드 전설 제외', () => {
  it.each(['easy', 'normal', 'hard'] as const)('도감이 비어 있어도 일반 의뢰(%s)를 수주할 수 있다', async difficulty => {
    const uid = await seed({ state: { dex: {}, location: at('harbor') } });
    const quest = dailyQuestFor('pacific', difficulty, uid, TODAY_KST)!;
    const res = await callAction(userToken(uid), { type: 'acceptQuest', questId: quest.id, port: 'harbor' });
    expect(res.status).toBe(200);
  });

  it('네임드 토벌은 일반·희귀·영웅만 다 잡으면 전설 없이도 수주하고, 영웅 이하가 1종이라도 빠지면 dex-incomplete(422)다', async () => {
    const uidOk = await seed({ state: { dex: zoneDex('pacific', 'named'), location: at('harbor') } });
    const questOk = offeredQuestsFor('pacific', 'named', uidOk, TODAY_KST)[0];
    expect((await callAction(userToken(uidOk), { type: 'acceptQuest', questId: questOk.id, port: 'harbor' })).status).toBe(200);

    const incompleteDex = zoneDex('pacific', 'named');
    const removedId = Object.keys(incompleteDex).sort()[0];
    delete incompleteDex[removedId];
    const uidMissing = await seed({ state: { dex: incompleteDex, location: at('harbor') } });
    const questMissing = offeredQuestsFor('pacific', 'named', uidMissing, TODAY_KST)[0];
    const res = await callAction(userToken(uidMissing), { type: 'acceptQuest', questId: questMissing.id, port: 'harbor' });
    expect(res).toMatchObject({ status: 422, body: { error: 'dex-incomplete' } });
  });
});

describe('실시간 닉네임 즉시 동기화', () => {
  it('setNickname 성공 시에만 setNick을 호출하고 중복·형식 오류 시에는 호출하지 않는다', async () => {
    const calls: Array<[string, string]> = [];
    provideSetNick((u, n) => { calls.push([u, n]); });
    try {
      const uid = await seed({ state: {}, nickname: '기존이름' });
      await seed({ state: {}, nickname: '중복이름' });

      const okRes = await callAction(userToken(uid), { type: 'setNickname', nickname: '변경성공' });
      expect(okRes.status).toBe(200);
      expect(calls).toEqual([[uid, '변경성공']]);

      vi.setSystemTime(Date.parse(NOW) + 2000);
      const dupRes = await callAction(userToken(uid), { type: 'setNickname', nickname: '중복이름' });
      expect(dupRes).toMatchObject({ status: 422, body: { error: 'nickname-taken' } });

      vi.setSystemTime(Date.parse(NOW) + 4000);
      const badRes = await callAction(userToken(uid), { type: 'setNickname', nickname: '!' });
      expect(badRes.status).toBe(422);
      expect(calls).toEqual([[uid, '변경성공']]);
    } finally {
      provideSetNick(() => {});
    }
  });

  it('setNickname DB 커밋 직후 재연결 없이 접속자 목록·피어 전파·후속 채팅에 새 닉네임이 반영된다', async () => {
    const uidA = await seed({ state: {}, nickname: '처음선장' });
    const uidB = await seed({ state: {}, nickname: '관찰선장' });
    const { db } = database();
    const server = createServer();
    const live = attachLive(server, {
      origin: LOCAL_ORIGIN,
      stale: () => false,
      authenticate: async (req) => {
        const uid = req.headers.cookie;
        if (!uid) return null;
        const { nick, boat } = await liveIdentity(db, uid);
        return { uid, nick: nick ?? '낚시꾼', boat, guest: false };
      },
      chat: {
        save: (user, text, guild) => saveChat(db, user.uid, user.nick, text, guild),
        recent: async () => [],
        blocked: async () => [],
        guildOf: async () => null,
      },
      recordSession: () => {},
      savePosition: () => {},
    });
    provideSetNick((u, n) => live.setNick(u, n));

    const connectWs = (uid: string) => {
      const port = (server.address() as AddressInfo).port;
      const ws = new WebSocket(`ws://127.0.0.1:${port}${LIVE_PATH}`, {
        headers: { origin: LOCAL_ORIGIN, cookie: uid },
      });
      const queue: ServerMessage[] = [];
      const waiters: Array<(m: ServerMessage) => void> = [];
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as ServerMessage;
        const w = waiters.shift();
        if (w) w(msg);
        else queue.push(msg);
      });
      const next = () => new Promise<ServerMessage>((resolve) => {
        const msg = queue.shift();
        if (msg) resolve(msg);
        else waiters.push(resolve);
      });
      return { ws, next };
    };

    try {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const a = connectWs(uidA);
      const b = connectWs(uidB);
      await a.next();
      await b.next();

      a.ws.send(JSON.stringify({ t: 'move', region: 'sea', x: 10, y: 20, dir: 1, line: false }));
      expect(await b.next()).toMatchObject({ t: 'join', presence: { uid: uidA, nick: '처음선장' } });

      const res = await callAction(userToken(uidA), { type: 'setNickname', nickname: '바뀐선장' });
      expect(res.status).toBe(200);

      expect(await b.next()).toEqual({ t: 'nick', uid: uidA, nick: '바뀐선장' });
      expect(live.online().find(o => o.uid === uidA)?.nick).toBe('바뀐선장');
      expect(live.presenceOf(uidA)?.nick).toBe('바뀐선장');

      a.ws.send(JSON.stringify({ t: 'chat', text: '변경 후 첫 채팅' }));
      expect(await a.next()).toMatchObject({ t: 'chat', line: { uid: uidA, nick: '바뀐선장', text: '변경 후 첫 채팅' } });
      expect(await b.next()).toMatchObject({ t: 'chat', line: { uid: uidA, nick: '바뀐선장', text: '변경 후 첫 채팅' } });

      const { rows } = await env.client.query<{ nick: string; text: string }>(
        'select nick, text from public.chat_messages where user_id = $1 order by id desc limit 1',
        [uidA],
      );
      expect(rows[0]).toEqual({ nick: '바뀐선장', text: '변경 후 첫 채팅' });

      a.ws.close();
      b.ws.close();
    } finally {
      provideSetNick(() => {});
      live.close();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});

describe('일반 의뢰 진행도 동기 반영', () => {
  it('캐치가 수주 중인 의뢰 조건에 맞지 않으면 신호를 붙이지 않는다', async () => {
    const uid = await seed({ state: { boat: 1 } });
    const quest = BOUNTIES.find(b => b.zone === 'seasia' && b.difficulty === 'easy')!;
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, quest.zone, quest.id, NOW]);
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good' });
    expect(res.status).toBe(200);
    const result = (res.body as { result: { type: string; bountyProgressed?: true } }).result;
    expect(result.type).toBe('catch');
    expect('bountyProgressed' in result).toBe(false);
    expect(await env.client.query('select 1 from public.bounty_progress where user_id = $1 and progress > 0', [uid]))
      .toMatchObject({ rowCount: 0 });
  });

  it('의뢰 진행도 갱신이 실패해도 캐치 확정과 200 응답은 보존한다', async () => {
    const uid = await seed({ state: { boat: 1 } });
    for (const q of BOUNTIES.filter(b => b.zone === 'pacific' && b.difficulty !== 'named')) {
      await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
        [uid, q.zone, q.id, NOW]);
    }
    await env.client.query(`
      create or replace function public.test_block_bounty_progress_update() returns trigger language plpgsql as $$
      begin
        raise exception 'bounty progress test failure';
      end;
      $$;
    `);
    await env.client.query(`
      create trigger test_block_bounty_progress_update
      before update on public.bounty_progress
      for each row execute function public.test_block_bounty_progress_update()
    `);
    try {
      const res = await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good' });
      expect(res.status).toBe(200);
      const result = (res.body as { result: { type: string; bountyProgressed?: true } }).result;
      expect(result.type).toBe('catch');
      expect('bountyProgressed' in result).toBe(false);
      const db = await dumpUser(env.client, uid);
      const save = db.saves_current[0] as { version: string; fame: string };
      expect(save.version).toBe('3');
      expect(Number(save.fame)).toBeGreaterThan(0);
      expect(db.fish_instances).toHaveLength(1);
      expect(db.records).toHaveLength(1);
      expect((db.bounty_progress as { progress: number }[]).every(r => r.progress === 0)).toBe(true);
    } finally {
      await env.client.query('drop trigger if exists test_block_bounty_progress_update on public.bounty_progress');
      await env.client.query('drop function if exists public.test_block_bounty_progress_update()');
    }
  });
});
