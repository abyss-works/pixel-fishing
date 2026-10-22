// 액션 엔드포인트 특성 테스트 — 같은 입력에 같은 응답과 같은 DB 상태가 나오는지 실제 Postgres로 고정한다.
// 스냅샷은 데이터 계층 전환 전 구현으로 기록했다. 전환 뒤 구현도 이 스냅샷을 그대로 통과해야 한다.
// 난수는 고정 시드, 시각은 고정된 가짜 시계, uid는 테스트 번호로 고정한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOUNTIES, bountyById, dailyQuestFor } from '../src/game/content/bounties.js';
import type { BountyZone } from '../src/game/content/bounties.js';
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
    delete process.env.VERCEL_ENV;
  };
});

async function seed(opts: SeedOptions = {}): Promise<string> {
  return seedUser(env.client, { uid: testUid(nextUid++), ...opts });
}

async function snapshotOf(uid: string, res: unknown) {
  return { res: normalize(res, uid), db: await dumpUser(env.client, uid) };
}

/** 사용자를 만들고 액션 하나를 보낸 뒤 응답과 DB 상태를 정규화해 돌려준다 */
async function run(opts: SeedOptions, action: unknown, call: { origin?: string } = {}) {
  const uid = await seed(opts);
  return snapshotOf(uid, await callAction(userToken(uid, opts.email ?? null), action, call));
}

/** 해역 라이선스 도감 조건을 채운 도감 */
function zoneDex(zone: BountyZone, tier: keyof typeof LICENSE_GRADES): GameState['dex'] {
  const dex: GameState['dex'] = {};
  for (const id of zoneDexMissing(newState(), zone, LICENSE_GRADES[tier])) {
    dex[id] = { normal: { count: 1, maxSize: 30, first: '2026-01-01' } };
  }
  return dex;
}

const at = (id: 'home' | 'harbor' | 'colombo'): GameState['location'] => ({ kind: 'base', id });

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
    expect(await run({ state: { bag } }, { type: 'catch', spot: 'pond', judgment: 'normal' })).toMatchSnapshot();
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
    const named = dailyQuestFor('pacific', 'named', uid, TODAY_KST)!;
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
    const res = await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good', forceEncounter: true },
      { origin: LOCAL_ORIGIN });
    expect(await snapshotOf(uid, res)).toMatchSnapshot();
  });

  it('강제 조우가 허용되지 않으면 통상 캐치로 처리한다', async () => {
    const uid = await seed({ state: { boat: 1 } });
    const named = dailyQuestFor('pacific', 'named', uid, TODAY_KST)!;
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
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

  it('미끼 구매와 장착', async () => {
    const uid = await seed({ state: { gold: 10_000, location: at('colombo') } });
    const buy = await callAction(userToken(uid), { type: 'buyBait', bait: 'bait-rare', count: 3 });
    vi.setSystemTime(Date.parse(NOW) + 2000);
    const equip = await callAction(userToken(uid), { type: 'setActiveBait', bait: 'bait-rare' });
    expect({ buy: normalize(buy, uid), ...(await snapshotOf(uid, equip)) }).toMatchSnapshot();
  });

  it('첫 방문 이동은 방문 이벤트를 남긴다', async () => {
    expect(await run({ state: { boat: 1 } }, { type: 'travel', to: { kind: 'region', id: 'ocean' } })).toMatchSnapshot();
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
  const pacificState = (): Partial<GameState> => ({ fame: 1500, dex: zoneDex('pacific', 'basic'), location: at('harbor') });

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
    const named = dailyQuestFor('pacific', 'named', uid, TODAY_KST)!;
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
    expect(await run({ state: {}, email: 'someone@example.com' }, { type: 'import', save })).toMatchSnapshot();
  });

  it('소유자는 상태를 통째로 바꾸고 전체 상태를 돌려받는다', async () => {
    expect(await run({ state: { bag: [fish('crucian')] }, email: OWNER }, { type: 'import', save })).toMatchSnapshot();
  });
});

describe('개발 명령', () => {
  it('로컬 오리진의 상태 명령은 허용된다', async () => {
    expect(await run({ state: {} }, { type: 'debug', command: 'stats.set', args: { gold: 1000 } }, { origin: LOCAL_ORIGIN }))
      .toMatchSnapshot();
  });

  it('소유자가 아니고 로컬 오리진도 아니면 거부한다', async () => {
    expect(await run({ state: {} }, { type: 'debug', command: 'stats.set', args: { gold: 1000 } })).toMatchSnapshot();
  });

  it('운영 배포는 로컬 오리진이어도 거부한다', async () => {
    process.env.VERCEL_ENV = 'production';
    expect(await run({ state: {} }, { type: 'debug', command: 'stats.set', args: { gold: 1000 } }, { origin: LOCAL_ORIGIN }))
      .toMatchSnapshot();
  });

  it('도감 채우기 명령은 도감 행을 쓴다', async () => {
    expect(await run({ state: {} }, { type: 'debug', command: 'dex.completeZone', args: { zone: 'pacific' } }, { origin: LOCAL_ORIGIN }))
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
    const near = await callAction(userToken(uid), { type: 'debug', command: 'bounty.expireTickets' }, { origin: LOCAL_ORIGIN });
    vi.setSystemTime(Date.parse(NOW) + 2000);
    const reset = await callAction(userToken(uid), { type: 'debug', command: 'bounty.resetToday' }, { origin: LOCAL_ORIGIN });
    vi.setSystemTime(Date.parse(NOW) + 4000);
    const clear = await callAction(userToken(uid), { type: 'debug', command: 'bounty.clearTickets' }, { origin: LOCAL_ORIGIN });
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
  const pacificState = (): Partial<GameState> => ({ fame: 1500, dex: zoneDex('pacific', 'basic'), location: at('harbor') });
  const namedState = (): Partial<GameState> => ({ fame: 1500, dex: zoneDex('pacific', 'named'), location: at('harbor') });
  const offered = (uid: string, difficulty: 'easy' | 'normal' | 'hard' | 'named', day = TODAY_KST) =>
    dailyQuestFor('pacific', difficulty, uid, day)!;
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
    // 진 쪽은 진행 행 선소비에서 지거나(422) 직전 성공 액션과의 간격에서 걸린다(429)
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
    const uid = await seed({ state: { boat: 1, namedPity: { day: TODAY_KST, misses: NAMED_PITY_CATCHES - 1, fails: 0 } } });
    const named = dailyQuestFor('pacific', 'named', uid, TODAY_KST)!;
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, 0, $4)',
      [uid, named.zone, named.id, NOW]);
    await callAction(userToken(uid), { type: 'catch', spot: 'sea', judgment: 'good' });
    const db = await dumpUser(env.client, uid);
    expect(db.bounty_tickets).toHaveLength(1);
    expect((db.saves_current[0] as { data: GameState }).data.namedPity).toEqual({ day: TODAY_KST, misses: 0, fails: 0 });
  });
});
