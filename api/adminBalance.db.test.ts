// 밸런스 라이브 지표 읽기를 실제 Postgres에서 검사한다. 관리자 판정(401·403)과 요청 검증, 지표별 결과를 본다.
// 집계에서 빼는 계정(제재 계정, 골드와 명성이 모두 0인 익명 계정)과 기간 창은 정확한 값으로 고정한다.
// 이벤트 시각은 오늘(KST) 정오에서 며칠 전인지로 정한다. 테스트를 실행하는 시각이 결과에 영향을 주지 않는다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOATS } from '../src/game/content/boats.js';
import { seedUser, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

const ADMIN = testUid(901);    // 관리자 명부에 있는 이메일 사용자. 저장 행이 없다
const OUTSIDER = testUid(902); // 명부에 없는 사용자
const ALICE = testUid(911);    // 이메일 계정
const BOB = testUid(912);      // 익명. 골드는 2단계 배 값과 같고 명성이 하한보다 1 모자란다
const CAROL = testUid(913);    // 이메일 계정. 3단계 배 기준으로 같은 상태다
const DAN = testUid(914);      // 골드와 명성이 모두 0인 이메일 계정
const EVE = testUid(915);      // 익명. 골드만 있다
const FRANK = testUid(916);    // 익명. 명성만 있다
const JACK = testUid(917);     // 골드와 명성이 2단계 배 요구와 같다. 마지막 저장이 7일에서 1시간 모자란 시점이다
const KATE = testUid(918);     // 마지막 배
const GINA = testUid(919);     // 제외 대상: 골드와 명성이 모두 0인 익명
const HANK = testUid(920);     // 제외 대상: 제재된 계정
const NOSAVE = testUid(921);   // 저장 행이 없는 익명 계정

type Row = Record<string, unknown>;
interface Out { status: number; body: unknown; headers: Record<string, string> }

let env: ActionEnv;
/** 시드 시점의 KST 오늘 날짜 */
let today = '';

const tier = (n: number) => BOATS.find(b => b.tier === n)!;

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: ADMIN, email: 'admin@example.test', nickname: null });
  await seedUser(env.client, { uid: OUTSIDER, email: 'outsider@example.test', nickname: null });
  await env.client.query('insert into public.admins (user_id) values ($1)', [ADMIN]);
  today = (await env.client.query(`select ((now() at time zone 'Asia/Seoul')::date)::text as d`)).rows[0].d as string;
});
afterAll(async () => {
  await env?.stop();
});

async function callAdmin(query: Record<string, string>, token: string | null = null): Promise<Out> {
  const { default: handler } = await import('./admin.js');
  const out: Out = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method: 'GET', query, headers: token ? { authorization: `Bearer ${token}` } : {} } as never, res as never);
  return out;
}

async function live(params: Record<string, string> = {}): Promise<Row> {
  const res = await callAdmin({ q: 'balanceLive', ...params }, userToken(ADMIN));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as Row;
}

/** today에서 days일 전의 KST 날짜 */
async function dayAgo(days: number): Promise<string> {
  return (await env.client.query(`select ($1::date - $2::int)::text as d`, [today, days])).rows[0].d as string;
}

describe('요청 검증과 관리자 판정', () => {
  it('토큰이 없거나 확인되지 않으면 401이다', async () => {
    expect(await callAdmin({ q: 'balanceLive' })).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
    expect(await callAdmin({ q: 'balanceLive' }, 'bad.token.here')).toMatchObject({ status: 401 });
  });

  it('관리자 명부에 없는 사용자는 403이고 데이터를 받지 못한다', async () => {
    const variants: Record<string, string>[] = [{}, { days: '3' }, { days: 'x' }];
    for (const params of variants) {
      const res = await callAdmin({ q: 'balanceLive', ...params }, userToken(OUTSIDER));
      expect(res, JSON.stringify(params)).toMatchObject({ status: 403 });
      expect(res.body, JSON.stringify(params)).toEqual({ error: 'forbidden' });
    }
  });

  it('기간이 정수가 아니면 관리자에게 400 bad-days다', async () => {
    for (const days of ['x', '1.5', '-1', '1000', '', '3d']) {
      const res = await callAdmin({ q: 'balanceLive', days }, userToken(ADMIN));
      expect(res, JSON.stringify(days)).toMatchObject({ status: 400, body: { error: 'bad-days' } });
    }
  });

  it('응답은 캐시하지 않는다', async () => {
    for (const res of [
      await callAdmin({ q: 'balanceLive' }, userToken(ADMIN)),
      await callAdmin({ q: 'balanceLive' }, userToken(OUTSIDER)),
      await callAdmin({ q: 'balanceLive' }),
    ]) {
      expect(res.headers['cache-control']).toBe('private, no-store');
    }
  });
});

describe('데이터가 없는 상태', () => {
  it('목록은 비고 합계는 0이며, 값이 없는 분위와 비율은 null이다', async () => {
    expect(await live()).toEqual({
      judgment: [],
      spots: [],
      dexBuckets: [],
      boats: [],
      rodBuckets: [],
      gold: { p25: null, p50: null, p75: null, p90: null, max: null },
      goldFlow: { sellGold: 0, couponGold: 0, rodCost: 0, boatCost: 0, baitCost: 0 },
      dau: [],
      churn: [],
      bountyFunnel: { namedAccepts: 0, tickets: 0, duelsWon: 0, duelsLost: 0, generalAccepts: 0, delivered: 0 },
      anomalies: { fastGaps: 0, fastUsers: 0, perfectPct: null },
      fameGateStuck: [],
    });
  });
});

describe('지표 결과', () => {
  /** today 정오에서 daysAgo일 전, seconds초 뒤 시각의 이벤트. 같은 사용자는 시간순으로 넣는다 */
  const event = (uid: string, type: string, payload: Row, daysAgo: number, seconds = 0) => env.client.query(
    `insert into public.events (user_id, type, payload, created_at)
     values ($1, $2, $3, (($4::date - $5::int) + time '12:00' + make_interval(secs => $6::int)) at time zone 'Asia/Seoul')`,
    [uid, type, payload, today, daysAgo, seconds]);

  const catchOf = (judgment: string | null, spot: string | null): Row => ({
    fishId: 'carp', form: 'normal', size: 10,
    ...(judgment ? { judgment } : {}), ...(spot ? { spot } : {}),
  });

  /** 일반 폼 어종 n종의 도감 행 */
  const species = (uid: string, n: number, form = 'normal') => env.client.query(
    `insert into public.records (user_id, fish_id, form, count)
     select $1::uuid, 'fish-' || g, $2::text, 1 from generate_series(1, $3::int) g`, [uid, form, n]);

  beforeAll(async () => {
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
    const players: { uid: string; email: string | null; gold: number; fame: number; boat: number; rod: number; updatedAt: string; restricted?: boolean }[] = [
      { uid: ALICE, email: 'alice@example.test', gold: 300, fame: 50, boat: 1, rod: 6, updatedAt: hoursAgo(0) },
      { uid: BOB, email: null, gold: tier(2).price, fame: tier(2).fameReq - 1, boat: 1, rod: 12, updatedAt: hoursAgo(9 * 24) },
      { uid: CAROL, email: 'carol@example.test', gold: tier(3).price, fame: tier(3).fameReq - 1, boat: 2, rod: 31, updatedAt: hoursAgo(10 * 24) },
      { uid: DAN, email: 'dan@example.test', gold: 0, fame: 0, boat: 0, rod: 1, updatedAt: hoursAgo(11 * 24) },
      { uid: EVE, email: null, gold: 50, fame: 0, boat: 0, rod: 2, updatedAt: hoursAgo(9 * 24) },
      { uid: FRANK, email: null, gold: 0, fame: 5, boat: 0, rod: 17, updatedAt: hoursAgo(9 * 24) },
      { uid: JACK, email: 'jack@example.test', gold: tier(2).price, fame: tier(2).fameReq, boat: 1, rod: 7, updatedAt: hoursAgo(6 * 24 + 23) },
      { uid: KATE, email: 'kate@example.test', gold: 1_000_000, fame: 1_000_000, boat: BOATS.length, rod: 25, updatedAt: hoursAgo(0) },
      { uid: GINA, email: null, gold: 0, fame: 0, boat: 0, rod: 1, updatedAt: hoursAgo(9 * 24) },
      { uid: HANK, email: null, gold: 9_999_999, fame: 0, boat: 1, rod: 40, updatedAt: hoursAgo(0), restricted: true },
    ];
    for (const p of players) {
      await seedUser(env.client, { uid: p.uid, email: p.email, nickname: null, updatedAt: p.updatedAt, restricted: p.restricted,
        state: { gold: p.gold, fame: p.fame, boat: p.boat, rod: p.rod } });
    }
    await seedUser(env.client, { uid: NOSAVE, nickname: null });

    // 도감: 일반 폼 발견 어종 수. 변이 폼과 횟수가 0인 행은 세지 않는다
    await species(ALICE, 12);
    await species(ALICE, 3, 'variant');
    await species(BOB, 90);
    await species(CAROL, 10);
    await species(DAN, 3);
    await species(EVE, 2, 'variant');
    await env.client.query(`insert into public.records (user_id, fish_id, form, count) values ($1, 'solo', 'normal', 1)`, [FRANK]);
    await species(JACK, 9);
    await env.client.query(`insert into public.records (user_id, fish_id, form, count) values ($1, 'ghost', 'normal', 0)`, [JACK]);
    await species(HANK, 50);

    // 기간 창 밖(8일 전)
    await event(ADMIN, 'catch', catchOf('perfect', 'pond'), 8);
    await event(ADMIN, 'sell', { gold: 10000 }, 8, 1);
    await event(BOB, 'acceptQuest', { questId: 'pacific-named-1' }, 8);
    // 6일 전
    await event(BOB, 'catch', catchOf('normal', 'reef'), 6);
    await event(BOB, 'catch', catchOf('normal', 'reef'), 6, 1);
    await event(BOB, 'catch', catchOf('perfect', 'reef'), 6, 2);
    await event(BOB, 'acceptQuest', { questId: 'pacific-named-1' }, 6, 10);
    await event(BOB, 'ticket', { questId: 'pacific-named-1' }, 6, 11);
    await event(BOB, 'resolveChallenge', { questId: 'pacific-named-1', success: true, hits: 3, misses: 0 }, 6, 12);
    await event(BOB, 'deliverBounty', { questId: 'pacific-named-1', reward: 5000 }, 6, 13);
    await event(ALICE, 'sell', { gold: 1000 }, 6);
    await event(ALICE, 'buyBoat', { tier: 2, cost: 1000 }, 6, 1);
    await event(DAN, 'boot', {}, 6);
    // 5일 전. 첫째와 둘째 캐치는 1초 간격이고, 둘째와 셋째 캐치는 정확히 2초 간격이다
    await event(ALICE, 'catch', catchOf('perfect', 'pond'), 5);
    await event(ALICE, 'catch', catchOf('perfect', 'pond'), 5, 1);
    await event(ALICE, 'catch', catchOf('good', 'pond'), 5, 3);
    await event(ALICE, 'sell', { gold: 100 }, 5, 10);
    await event(ALICE, 'coupon', { code: 'WELCOME', gold: 300 }, 5, 11);
    await event(ALICE, 'upgradeRod', { toLevel: 6, cost: 80 }, 5, 12);
    await event(CAROL, 'catch', catchOf(null, null), 5);
    await event(CAROL, 'acceptQuest', { questId: 'harbor-general-3' }, 5, 10);
    await event(CAROL, 'ticket', { questId: 'harbor-named-1' }, 5, 11);
    await event(CAROL, 'resolveChallenge', { questId: 'harbor-named-1', success: false, hits: 1, misses: 2 }, 5, 12);
    await event(CAROL, 'deliverBounty', { questId: 'harbor-general-3', reward: 800 }, 5, 13);
    await event(EVE, 'boot', {}, 5);
    await event(ADMIN, 'boot', {}, 5);
    // 2일 전
    await event(ALICE, 'catch', catchOf('normal', 'pond'), 2);
    await event(ALICE, 'acceptQuest', { questId: 'harbor-general-4' }, 2, 10);
    await event(ALICE, 'resolveChallenge', { questId: 'harbor-named-1', success: false, hits: 0, misses: 3 }, 2, 11);
    await event(ADMIN, 'sell', { gold: 10 }, 2);
    await event(BOB, 'buyBait', { bait: 'worm', count: 3, cost: 30 }, 2);
    await event(NOSAVE, 'catch', catchOf('good', 'pond'), 2);
    await event(FRANK, 'boot', {}, 2);
    // 제외 대상의 이벤트. 집계에 들어가면 어느 지표든 값이 달라진다
    for (let s = 0; s < 5; s++) await event(HANK, 'catch', catchOf('perfect', 'abyss'), 2, s);
    await event(HANK, 'sell', { gold: 100000 }, 2, 10);
    await event(HANK, 'coupon', { code: 'WELCOME', gold: 7777 }, 2, 11);
    await event(HANK, 'upgradeRod', { toLevel: 40, cost: 5000 }, 2, 12);
    await event(HANK, 'buyBoat', { tier: 7, cost: 150000 }, 2, 13);
    await event(HANK, 'buyBait', { bait: 'worm', count: 1, cost: 5 }, 2, 14);
    for (let i = 0; i < 3; i++) await event(HANK, 'acceptQuest', { questId: 'pacific-named-1' }, 2, 20 + i);
    for (let i = 0; i < 2; i++) await event(HANK, 'ticket', { questId: 'pacific-named-1' }, 2, 30 + i);
    for (let i = 0; i < 4; i++) await event(HANK, 'deliverBounty', { questId: 'pacific-named-1', reward: 5000 }, 2, 40 + i);
    await event(HANK, 'boot', {}, 5);
    await event(HANK, 'boot', {}, 6);
    await event(GINA, 'boot', {}, 2);
    await event(GINA, 'catch', catchOf('perfect', 'pond'), 2, 1);
    await event(GINA, 'sell', { gold: 1000000 }, 2, 2);
  });

  const golds = [300, tier(2).price, tier(3).price, 0, 50, 0, tier(2).price, 1_000_000].sort((a, b) => a - b);
  /** 이산 분위. 누적 비율이 p 이상이 되는 첫 값이다 */
  const discrete = (p: number) => golds[Math.ceil(p * golds.length) - 1];

  it('기간을 생략하면 7일이고, 7일을 넘는 기간은 7일로 맞춘다', async () => {
    const week = await live({ days: '7' });
    expect(await live()).toEqual(week);
    expect(await live({ days: '30' })).toEqual(week);
    expect(await live({ days: '999' })).toEqual(week);
  });

  it('판정 분포: 7일 안의 캐치를 많은 순으로 세고, 같은 수는 이름순이며, 판정이 없는 캐치는 ?다', async () => {
    expect((await live()).judgment).toEqual([
      { judgment: 'normal', catches: 3, pct: 33.3 },
      { judgment: 'perfect', catches: 3, pct: 33.3 },
      { judgment: 'good', catches: 2, pct: 22.2 },
      { judgment: '?', catches: 1, pct: 11.1 },
    ]);
  });

  it('체류 해역: 해역별 캐치 수와 사용자 수이며, 해역이 없는 캐치는 spot이 null이다', async () => {
    expect((await live()).spots).toEqual([
      { spot: 'pond', catches: 5, users: 2 },
      { spot: 'reef', catches: 3, users: 1 },
      { spot: null, catches: 1, users: 1 },
    ]);
  });

  it('도감 진행: 일반 폼 발견 어종 수를 10종 구간으로 묶고 90종 이상은 한 구간이다', async () => {
    expect((await live()).dexBuckets).toEqual([
      { fromSpecies: 0, users: 3 },
      { fromSpecies: 10, users: 2 },
      { fromSpecies: 90, users: 1 },
    ]);
  });

  it('배 단계 분포: 제외 대상을 뺀 저장 상태를 단계별로 센다', async () => {
    expect((await live()).boats).toEqual([
      { boat: 0, users: 3 },
      { boat: 1, users: 3 },
      { boat: 2, users: 1 },
      { boat: BOATS.length, users: 1 },
    ]);
  });

  it('낚싯대 레벨 분포: 5레벨 구간이고 31레벨 이상은 한 구간이다', async () => {
    expect((await live()).rodBuckets).toEqual([
      { fromLevel: 1, users: 2 },
      { fromLevel: 6, users: 2 },
      { fromLevel: 11, users: 1 },
      { fromLevel: 16, users: 1 },
      { fromLevel: 21, users: 1 },
      { fromLevel: 31, users: 1 },
    ]);
  });

  it('골드 잔고 분위: 제외 대상을 뺀 사용자의 이산 분위와 최대다', async () => {
    expect((await live()).gold).toEqual({
      p25: discrete(0.25), p50: discrete(0.5), p75: discrete(0.75), p90: discrete(0.9), max: 1_000_000,
    });
    expect(golds).toHaveLength(8);
  });

  it('골드 흐름: 7일 안의 유입과 유출을 합산한다', async () => {
    expect((await live()).goldFlow).toEqual({ sellGold: 1110, couponGold: 300, rodCost: 80, boatCost: 1000, baitCost: 30 });
  });

  it('일일 활성: KST 날짜별로 이벤트가 있는 사용자 수를 날짜 오름차순으로 센다. 저장 행이 없는 계정도 센다', async () => {
    // 6일 전: BOB, ALICE, DAN. 5일 전: ALICE, CAROL, EVE, ADMIN. 2일 전: ALICE, ADMIN, BOB, NOSAVE, FRANK
    expect((await live()).dau).toEqual([
      { day: await dayAgo(6), dau: 3 },
      { day: await dayAgo(5), dau: 4 },
      { day: await dayAgo(2), dau: 5 },
    ]);
  });

  it('이탈 지점: 7일 넘게 저장이 없는 사용자의 배별 인원과 평균 명성·낚싯대 레벨이다', async () => {
    expect((await live()).churn).toEqual([
      { boat: 0, users: 3, avgFame: 2, avgRod: 6.7 },
      { boat: 1, users: 1, avgFame: tier(2).fameReq - 1, avgRod: 12 },
      { boat: 2, users: 1, avgFame: tier(3).fameReq - 1, avgRod: 31 },
    ]);
  });

  it('바운티 퍼널: 네임드·일반 수주, 도전권, 결투 승패, 납품을 센다', async () => {
    expect((await live()).bountyFunnel).toEqual({
      namedAccepts: 1, tickets: 2, duelsWon: 1, duelsLost: 2, generalAccepts: 2, delivered: 2,
    });
  });

  it('연타·PERFECT 이상치: 2초 미만 간격만 세고, 사용자별 첫 캐치와 정확히 2초 간격은 세지 않는다', async () => {
    expect((await live()).anomalies).toEqual({ fastGaps: 3, fastUsers: 2, perfectPct: 33.3 });
  });

  it('명성 게이트 정체: 다음 배 값만큼 골드가 있고 명성이 모자란 사용자를 다음 배 단계별로 센다', async () => {
    // 골드는 있으나 명성이 하한보다 1 모자란 BOB(2단계)과 CAROL(3단계)만 센다.
    // 명성이 하한과 같은 JACK, 골드가 모자란 사용자, 마지막 배 사용자는 세지 않는다
    expect((await live()).fameGateStuck).toEqual([
      { nextBoat: 2, users: 1 },
      { nextBoat: 3, users: 1 },
    ]);
  });

  it('제외 여부는 계정 상태로 정해진다. 제재가 풀리거나 빈 익명 계정에 골드가 생기면 사용자 지표와 이벤트 지표에 함께 든다', async () => {
    const base = await live();
    const setSave = (uid: string, set: string) => env.client.query(`update public.saves_current set ${set} where user_id = $1`, [uid]);
    const day2 = await dayAgo(2);
    const sellGold = (r: Row) => (r.goldFlow as Row).sellGold;
    const dauOn2 = (r: Row) => (r.dau as { day: string; dau: number }[]).find(d => d.day === day2)?.dau;

    await setSave(GINA, 'gold = 1');
    try {
      const included = await live();
      expect((included.boats as Row[])[0]).toEqual({ boat: 0, users: 4 });
      expect((included.rodBuckets as Row[])[0]).toEqual({ fromLevel: 1, users: 3 });
      expect(sellGold(included)).toBe(1_001_110);
      expect(dauOn2(included)).toBe(6);
    } finally {
      await setSave(GINA, 'gold = 0');
    }

    await setSave(HANK, 'restricted = false');
    try {
      const included = await live();
      expect((included.gold as Row).max).toBe(9_999_999);
      expect(sellGold(included)).toBe(101_110);
      expect(included.spots).toContainEqual({ spot: 'abyss', catches: 5, users: 1 });
      expect(dauOn2(included)).toBe(6);
      expect((included.fameGateStuck as Row[])[0]).toEqual({ nextBoat: 2, users: 2 });
    } finally {
      await setSave(HANK, 'restricted = true');
    }

    expect(await live()).toEqual(base);
  });

  it('응답에는 이메일과 사용자 식별자가 없다', async () => {
    expect(JSON.stringify(await live())).not.toMatch(/example\.test|00000000-0000-4000/);
  });

  describe('기간', () => {
    it('3일이면 2일 전 이벤트만 남고, 사용자 수 지표는 기간과 무관하다', async () => {
      const week = await live();
      const three = await live({ days: '3' });
      expect(three).toEqual({
        ...week,
        judgment: [
          { judgment: 'good', catches: 1, pct: 50 },
          { judgment: 'normal', catches: 1, pct: 50 },
        ],
        spots: [{ spot: 'pond', catches: 2, users: 2 }],
        goldFlow: { sellGold: 10, couponGold: 0, rodCost: 0, boatCost: 0, baitCost: 30 },
        dau: [{ day: await dayAgo(2), dau: 5 }],
        bountyFunnel: { namedAccepts: 0, tickets: 0, duelsWon: 0, duelsLost: 1, generalAccepts: 1, delivered: 0 },
        anomalies: { fastGaps: 0, fastUsers: 0, perfectPct: 0 },
      });
    });

    it('1일이면 이 데이터에는 기간 안의 이벤트가 없다. 0일은 1일로 맞춘다', async () => {
      const one = await live({ days: '1' });
      expect(one).toMatchObject({
        judgment: [], spots: [], dau: [],
        goldFlow: { sellGold: 0, couponGold: 0, rodCost: 0, boatCost: 0, baitCost: 0 },
        bountyFunnel: { namedAccepts: 0, tickets: 0, duelsWon: 0, duelsLost: 0, generalAccepts: 0, delivered: 0 },
        anomalies: { fastGaps: 0, fastUsers: 0, perfectPct: null },
        boats: (await live()).boats,
      });
      expect(await live({ days: '0' })).toEqual(one);
    });
  });
});
