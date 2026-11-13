// 액션 엔드포인트 특성 테스트 — 같은 입력에 같은 응답과 같은 DB 상태가 나오는지 실제 Postgres로 고정한다.
// 스냅샷은 데이터 계층 전환 전 구현으로 기록했다. 전환 뒤 구현도 이 스냅샷을 그대로 통과해야 한다.
// 난수는 고정 시드, 시각은 고정된 가짜 시계, uid는 테스트 번호로 고정한다.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOUNTIES, bountyById, dailyQuestFor, offeredQuestsFor } from '../src/game/content/bounties.js';
import type { BountyZone } from '../src/game/content/bounties.js';
import { FISH } from '../src/game/content/fish.js';
import { LICENSE_GRADES, WALK_BAG_CAP, newState, zoneDexMissing } from '../src/game/rules/logic.js';
import type { GameState } from '../src/game/rules/logic.js';
import { NAMED_PITY_CATCHES, PITY_DONE, SPECIES_PITY_K } from '../src/game/rules/pity.js';
import {
  LOCAL_ORIGIN, callAction, captureRealClock, dumpUser, fish, normalize, seedUser, seededRandom,
  startActionEnv, testUid, userToken,
} from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';

const NOW = '2030-03-04T05:06:07.000Z';
const TODAY_KST = '2030-03-04';
const OWNER = 'inley@naver.com';
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

/** 해역 라이선스 도감 조건을 채운 도감 */
function zoneDex(zone: BountyZone, tier: keyof typeof LICENSE_GRADES): GameState['dex'] {
  const dex: GameState['dex'] = {};
  for (const id of zoneDexMissing(newState(), zone, LICENSE_GRADES[tier])) {
    dex[id] = { normal: { count: 1, maxSize: 30, first: '2026-01-01' } };
  }
  return dex;
}

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

  it('직전 액션과 간격이 너무 짧으면 429다', async () => {
    const recent = new Date(Date.parse(NOW) - 100).toISOString();
    expect(await run({ state: {}, version: 3, updatedAt: recent }, { type: 'upgradeRod' })).toMatchSnapshot();
  });
});

describe('첫 액션', () => {
  it('프로필과 저장 상태가 없는 사용자의 boot는 둘을 만들고 버전 2로 올린다', async () => {
    expect(await run({ nickname: null }, { type: 'boot', buildId: 'dev' })).toMatchSnapshot();
  });

  it('구 saves 행만 있는 사용자는 그 상태로 시딩한다', async () => {
    const uid = await seed();
    await env.client.query('insert into public.saves (user_id, data, updated_at) values ($1, $2, $3)', [uid, {
      v: 8, gold: 500, fame: 20, boat: 0, rod: 2, bag: [fish('crucian'), fish('minnow', { locked: true })],
      exhibit: [], dex: { crucian: { normal: { count: 3, maxSize: 31, first: '2026-01-02' } } },
      coupons: [], location: at('home'), visited: [], artifacts: [], items: {}, activeBait: null,
    }, '2026-01-03T00:00:00.000Z']);
    expect(await snapshotOf(uid, await callAction(userToken(uid), { type: 'boot' }))).toMatchSnapshot();
  });
});

describe('낚시', () => {
  it('통상 캐치는 개체와 도감을 쓰고 명성을 올린다', async () => {
    expect(await run({ state: {} }, { type: 'catch', spot: 'pond', judgment: 'good' })).toMatchSnapshot();
  });

  it('도감 기록이 있는 어종은 횟수를 이어 센다', async () => {
    // 연못 전 어종의 두 폼을 모두 채워 둔다 — 난수가 무엇을 뽑아도 기록이 있는 어종·폼이 잡힌다
    const dex: GameState['dex'] = {};
    for (const id of ['crucian', 'minnow', 'loach', 'carp', 'goldfish', 'goldcarp']) {
      const rec = { count: 5, maxSize: 99, first: '2026-01-01' };
      dex[id] = { normal: rec, variant: rec };
    }
    const out = await run({ state: { dex } }, { type: 'catch', spot: 'pond', judgment: 'perfect' });
    const caught = (out.db.events[0] as { payload: { fishId: string; form: string; isNew: boolean } }).payload;
    const records = out.db.records as { fish_id: string; form: string; count: string }[];
    expect(caught.isNew).toBe(false);
    expect(records.find(r => r.fish_id === caught.fishId && r.form === caught.form)?.count).toBe('6');
    expect(out).toMatchSnapshot();
  });

  it('가방이 가득 차면 가장 덜 특별한 개체를 방생한다', async () => {
    const bag = Array.from({ length: WALK_BAG_CAP }, (_, i) => fish(i % 2 ? 'minnow' : 'crucian', { size: 10 + i }));
    const out = await run({ state: { bag } }, { type: 'catch', spot: 'pond', judgment: 'normal' });
    // 자동 방생 이벤트는 놓아준 개체의 어종과 폼을 함께 남긴다
    const release = (out.db.events as { type: string; payload: { uids: string[]; fish: unknown[] } }[])
      .find(e => e.type === 'autoRelease')!;
    expect(release.payload.fish).toEqual([{ uid: release.payload.uids[0], fishId: expect.any(String), form: expect.any(String) }]);
    expect(out).toMatchSnapshot();
  });

  it('가방이 가득 차고 모두 잠겨 있으면 상한을 넘겨 보관한다', async () => {
    const bag = Array.from({ length: WALK_BAG_CAP }, (_, i) => fish('crucian', { size: 10 + i, locked: true }));
    expect(await run({ state: { bag } }, { type: 'catch', spot: 'pond', judgment: 'normal' })).toMatchSnapshot();
  });

  it('스냅샷 경계 버전은 전체 경로로 처리하고 saves에 아카이브를 남긴다', async () => {
    expect(await run({ state: { bag: [fish('crucian')] }, version: 49 }, { type: 'catch', spot: 'pond', judgment: 'good' }))
      .toMatchSnapshot();
  });

  it('잠긴 수역은 거부한다', async () => {
    expect(await run({ state: {} }, { type: 'catch', spot: 'sea', judgment: 'good' })).toMatchSnapshot();
  });

  it('진행 중인 일반 의뢰가 캐치에 맞으면 진행도가 오른다', async () => {
    const uid = await seed({ state: { boat: 1 } });
    for (const q of BOUNTIES.filter(b => b.zone === 'pacific' && b.difficulty === 'easy')) {
      await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
        [uid, q.zone, q.id, NOW]);
    }
    expect(await snapshotOf(uid, await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good' })))
      .toMatchSnapshot();
  });

  it('강제 조우를 허용받은 캐치는 진행 중인 네임드의 도전권을 발급한다', async () => {
    const uid = await seed({ state: { boat: 1 } });
    const named = offeredQuestsFor('pacific', 'named', uid, TODAY_KST)[0];
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good', forceEncounter: true });
    expect(await snapshotOf(uid, res)).toMatchSnapshot();
  });

  it('강제 조우가 허용되지 않으면 통상 캐치로 처리한다', async () => {
    const uid = await seed({ state: { boat: 1 } });
    const named = offeredQuestsFor('pacific', 'named', uid, TODAY_KST)[0];
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
    process.env.DEPLOY_ENV = 'preview';
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good', forceEncounter: true });
    expect(await snapshotOf(uid, res)).toMatchSnapshot();
  });
});

describe('가방', () => {
  it('판매는 개체를 지우고 골드를 더한다', async () => {
    const sold = fish('carp', { uid: testUid(9001) });
    expect(await run({ state: { bag: [sold, fish('crucian')] } }, { type: 'sell', uids: [sold.uid] })).toMatchSnapshot();
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
  const pacificState = (): Partial<GameState> => ({ dex: zoneDex('pacific', 'basic'), location: at('harbor') });

  it('오늘 배정된 일반 의뢰 수주는 수주·진행 행을 쓴다', async () => {
    const uid = await seed({ state: pacificState() });
    const quest = dailyQuestFor('pacific', 'easy', uid, TODAY_KST)!;
    const res = await callAction(userToken(uid), { type: 'acceptQuest', questId: quest.id, port: 'harbor' });
    expect(await snapshotOf(uid, res)).toMatchSnapshot();
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
    expect(await snapshotOf(uid, res)).toMatchSnapshot();
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
    expect(await run({ state: { bag: [fish('crucian')] }, email: OWNER }, { type: 'import', save })).toMatchSnapshot();
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
    expect(await run({ state: {} }, { type: 'debug', command: 'dex.completeZone', args: { zone: 'pacific' } }))
      .toMatchSnapshot();
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
  const pacificState = (): Partial<GameState> => ({ dex: zoneDex('pacific', 'basic'), location: at('harbor') });
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

  it('네임드 토벌 보상은 named 클리어로 남는다', async () => {
    const quest = bountyById('pacific-named-megalodon')!;
    const uid = await seed({ state: {} });
    await progressRow(uid, quest.id, 1, NOW);
    expect((await deliver(uid, quest.id)).status).toBe(200);
    expect((await dumpUser(env.client, uid)).bounty_clears)
      .toEqual([{ user_id: '<user>', kind: 'named', quest_id: quest.id, cleared_at: '<now>' }]);
  });

  it('같은 의뢰를 동시에 납품해도 보상과 클리어는 한 번이다', async () => {
    const quest = bountyById('pacific-easy-common')!;
    const uid = await seed({ state: {} });
    await progressRow(uid, quest.id, quest.count, NOW);
    const results = await Promise.all([deliver(uid, quest.id), deliver(uid, quest.id)]);
    // 진 쪽은 진행 행이 이미 없어 거부되거나(422) 직전 성공 액션과의 간격에서 걸린다(429).
    // 확정 문장이 겹쳐 같은 버전을 읽은 쪽도 진행 행이 지워진 것을 다시 읽어 422를 받으므로 409는 나오지 않는다
    const statuses = results.map(r => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([422, 429]).toContain(statuses[1]);
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

  it('5번째 캐치는 그 수역의 영웅 어종이고 보장 진척이 저장된다', async () => {
    const out = await run({ state: { firstCatch: { n: 4, legendAt: 12, epic: true, legend: true } } },
      { type: 'catch', spot: 'pond', judgment: 'auto' });
    const caught = (out.db.events[0] as { payload: { fishId: string } }).payload;
    expect(FISH.find(f => f.id === caught.fishId)).toMatchObject({ rarity: 'epic', spot: 'pond' });
    expect(stateOf(out).firstCatch).toMatchObject({ n: 5, legendAt: 12, epic: false, legend: true });
  });

  it('첫 캐치에서 서버가 전설 번호를 10~20 사이로 정해 저장한다', async () => {
    const out = await run({ state: {} }, { type: 'catch', spot: 'pond', judgment: 'auto' });
    const fc = stateOf(out).firstCatch;
    expect(fc.n).toBe(1);
    expect(fc.legendAt).toBeGreaterThanOrEqual(10);
    expect(fc.legendAt).toBeLessThanOrEqual(20);
  });

  it('정해진 번호의 캐치는 그 수역의 전설 어종이고 보장이 끝난다', async () => {
    const out = await run({ state: { firstCatch: { n: 11, legendAt: 12, epic: false, legend: true } } },
      { type: 'catch', spot: 'river', judgment: 'auto' });
    const caught = (out.db.events[0] as { payload: { fishId: string } }).payload;
    expect(FISH.find(f => f.id === caught.fishId)).toMatchObject({ rarity: 'legendary', spot: 'river' });
    expect(stateOf(out).firstCatch).toEqual({ n: 0, legendAt: 0, epic: false, legend: false });
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
    // 두 요청이 겹치면 409(동시 갱신)나 422(이미 받음), 앞 요청이 먼저 확정되면 429(액션 간격)다. 어느 쪽이든 지급은 한 번이다
    expect(results.filter(r => r.status !== 200).map(r => r.status)).toEqual([expect.toBeOneOf([409, 422, 429])]);
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
    expect(await snapshotOf(uid, out)).toMatchSnapshot();
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

describe('이사 코드 가져오기 접근 판정', () => {
  const save = { ...newState(), gold: 4321 };
  const ORIGINS = [undefined, LOCAL_ORIGIN, 'http://127.0.0.1', 'https://evil.example'];
  let seq = 0;
  // 소유자 이메일은 서버 설정이다. 호출마다 새 계정이 필요하므로 소유자 이메일도 호출마다 바꾼다
  const importAs = async (role: 'owner' | 'guest', origin?: string) => {
    const email = `gate-${role}-${seq++}@example.com`;
    process.env.IMPORT_OWNER_EMAIL = role === 'owner' ? email : 'gate-owner@example.com';
    const uid = await seed({ state: {}, email });
    return callAction(userToken(uid), { type: 'import', save }, { origin });
  };
  const verdict = (res: { status: number; body: unknown }) => [res.status, (res.body as { error?: string }).error ?? 'ok'];
  afterEach(() => { delete process.env.IMPORT_OWNER_EMAIL; });

  it('운영은 소유자도 비소유자도 Origin과 무관하게 거부한다', async () => {
    process.env.DEPLOY_ENV = 'production';
    for (const role of ['owner', 'guest'] as const) {
      for (const origin of ORIGINS) expect(verdict(await importAs(role, origin))).toEqual([403, 'import-disabled']);
    }
  });

  it('스테이징은 소유자만 허용하고 Origin을 속여도 비소유자는 거부한다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    for (const origin of ORIGINS) {
      expect(verdict(await importAs('owner', origin))).toEqual([200, 'ok']);
      expect(verdict(await importAs('guest', origin))).toEqual([403, 'import-owner-only']);
    }
  });

  it('로컬 명시 값은 Origin과 무관하게 허용한다', async () => {
    process.env.DEPLOY_ENV = 'local';
    for (const origin of ORIGINS) expect(verdict(await importAs('guest', origin))).toEqual([200, 'ok']);
  });

  it('소유자 이메일 설정이 비어 있어도 게스트는 소유자가 아니다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    const uid = await seed({ state: {}, email: null });
    process.env.IMPORT_OWNER_EMAIL = '';
    const res = await callAction(userToken(uid), { type: 'import', save });
    expect(verdict(res)).toEqual([403, 'import-owner-only']);
  });

  it('환경 값이 없거나 모르는 값이면 거부한다', async () => {
    for (const env of [undefined, 'development']) {
      if (env === undefined) delete process.env.DEPLOY_ENV; else process.env.DEPLOY_ENV = env;
      for (const role of ['owner', 'guest'] as const) {
        expect(verdict(await importAs(role, LOCAL_ORIGIN))).toEqual([403, 'import-disabled']);
      }
    }
  });
});

describe('개발 명령 허용 판정', () => {
  const debugVerdict = (res: { status: number; body: unknown }) => [res.status, (res.body as { error?: string }).error ?? 'ok'];
  let seq = 0;
  // 소유자 이메일은 서버 설정이다. 호출마다 새 계정이 필요하므로 소유자 이메일도 호출마다 바꾼다
  const seedRole = async (role: 'owner' | 'guest', state: object) => {
    const email = `debug-${role}-${seq++}@example.com`;
    process.env.IMPORT_OWNER_EMAIL = role === 'owner' ? email : 'debug-owner@example.com';
    return seed({ state, email });
  };
  afterEach(() => { delete process.env.IMPORT_OWNER_EMAIL; });
  const debugAs = async (role: 'owner' | 'guest', origin?: string) => {
    const uid = await seedRole(role, {});
    return callAction(userToken(uid), { type: 'debug', command: 'stats.set', args: { gold: 1000 } }, { origin });
  };
  // 강제 조우가 받아들여지면 진행 중인 네임드의 도전권이 발급된다
  const ticketsAfterForcedCatch = async (role: 'owner' | 'guest', origin?: string) => {
    const uid = await seedRole(role, { boat: 1 });
    const named = offeredQuestsFor('pacific', 'named', uid, TODAY_KST)[0];
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good', forceEncounter: true }, { origin });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const tickets = await env.client.query('select count(*)::int as n from public.bounty_tickets where user_id = $1', [uid]);
    return tickets.rows[0].n as number;
  };
  const ORIGINS = [undefined, LOCAL_ORIGIN, 'http://127.0.0.1', 'https://evil.example'];

  it('스테이징에서 Origin을 로컬로 속인 비소유자의 개발 명령은 거부한다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    for (const origin of ORIGINS) expect(debugVerdict(await debugAs('guest', origin))).toEqual([422, 'debug-forbidden']);
  });

  it('스테이징에서 소유자는 Origin과 무관하게 개발 명령을 쓴다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    for (const origin of ORIGINS) expect(debugVerdict(await debugAs('owner', origin))).toEqual([200, 'ok']);
  });

  it('운영은 소유자도 Origin과 무관하게 개발 명령을 거부한다', async () => {
    process.env.DEPLOY_ENV = 'production';
    for (const role of ['owner', 'guest'] as const) {
      for (const origin of ORIGINS) expect(debugVerdict(await debugAs(role, origin))).toEqual([422, 'debug-forbidden']);
    }
  });

  it('로컬 명시 값은 Origin과 무관하게 모두 허용한다', async () => {
    process.env.DEPLOY_ENV = 'local';
    for (const origin of ORIGINS) expect(debugVerdict(await debugAs('guest', origin))).toEqual([200, 'ok']);
  });

  it('환경 값이 없거나 모르는 값이면 로컬 Origin이어도 거부한다', async () => {
    for (const value of [undefined, 'development']) {
      if (value === undefined) delete process.env.DEPLOY_ENV; else process.env.DEPLOY_ENV = value;
      for (const role of ['owner', 'guest'] as const) {
        expect(debugVerdict(await debugAs(role, LOCAL_ORIGIN))).toEqual([422, 'debug-forbidden']);
      }
    }
  });

  it('스테이징에서 Origin을 속인 비소유자의 강제 조우는 통상 캐치로 처리한다', async () => {
    process.env.DEPLOY_ENV = 'preview';
    for (const origin of ORIGINS) expect(await ticketsAfterForcedCatch('guest', origin)).toBe(0);
    expect(await ticketsAfterForcedCatch('owner', undefined)).toBe(1);
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
      cooking: { recipe: 'cook-lunch-bite', count: 2, bonus: [false, true], startedAt: '2030-03-04T04:00:00.000Z' },
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
