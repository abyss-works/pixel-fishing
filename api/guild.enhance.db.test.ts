// 길드 10레벨 확장 및 스킬 자유 강화 — 실제 Postgres에서 마이그레이션 0038 제약, 길드원 누구나 강화 포인트 투자·초기화(20,000,000G, 쿨다운 없음),
// 항해일지 기록, 그리고 액션 경로의 합산 효과(기본 + 자유 강화, 최대 10단계)를 검사한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { capOfBoat, mutationWeightsOf, newState, priceOfInstance, variantShare } from '../src/game/rules/logic.js';
import { callAction, captureRealClock, fish, seedUser, seededRandom, sessionHeaders, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';
import { guildRoutes } from './guilds.js';

let env: ActionEnv;
let nextUid = 1401;
const routes = guildRoutes(() => {});

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});
beforeEach(() => {
  captureRealClock(() => performance.timeOrigin + performance.now());
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2030-05-01T05:00:00.000Z') });
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(77));
  return () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  };
});

async function call(path: string, method: string, who: string | null, opts: { body?: unknown; params?: Record<string, string> } = {}) {
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader() {},
  };
  await routes[path]({ method, body: opts.body, params: opts.params ?? {}, headers: sessionHeaders(who && userToken(who)) } as never,
    res as never);
  return out;
}

const goldOf = async (uid: string) =>
  Number((await env.client.query<{ gold: string }>('select gold from public.saves_current where user_id = $1', [uid])).rows[0].gold);

describe('길드 10레벨 및 자유 강화', () => {
  const enhancePath = '/api/guilds/:id/bonuses/:bonus/enhancements';
  const resetPath = '/api/guilds/:id/enhancements/reset';

  it('0038 스키마: guild_bonuses.enhance_rank는 0~5만 허용하고 guild_logs는 enhance·enhance-reset을 받는다', async () => {
    const uid = await seedUser(env.client, { uid: testUid(nextUid++), email: `e${nextUid}@test.dev`, state: {} });
    const { rows: [g] } = await env.client.query<{ id: string }>(
      `insert into public.guilds (name, code) values ($1, upper(substr(md5(random()::text), 1, 8))) returning id`, [`g${nextUid}`]);
    await expect(env.client.query(`insert into public.guild_bonuses (guild_id, bonus, enhance_rank) values ($1, 'sell', 6)`, [g.id]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(env.client.query(`insert into public.guild_bonuses (guild_id, bonus, enhance_rank) values ($1, 'sell', -1)`, [g.id]))
      .rejects.toMatchObject({ code: '23514' });
    await env.client.query(`insert into public.guild_logs (guild_id, user_id, kind, detail, value) values ($1, $2, 'enhance', 'sell', 1)`, [g.id, uid]);
    await env.client.query(`insert into public.guild_logs (guild_id, user_id, kind, value) values ($1, $2, 'enhance-reset', 1)`, [g.id, uid]);
  });

  it('길드원 누구나 Lv.6부터 기본 단계가 5 미만이어도 자유 강화를 올리고, 20,000,000G로 쿨다운 없이 초기화한다', async () => {
    const leader = await seedUser(env.client, { uid: testUid(nextUid++), email: `el${nextUid}@test.dev`, nickname: '선장', state: { gold: 1_000_000 } });
    const member = await seedUser(env.client, { uid: testUid(nextUid++), email: `em${nextUid}@test.dev`, nickname: '선원', state: { gold: 45_000_000 } });
    const outsider = await seedUser(env.client, { uid: testUid(nextUid++), email: `eo${nextUid}@test.dev`, nickname: '외부', state: { gold: 50_000_000 } });
    const guest = await seedUser(env.client, { uid: testUid(nextUid++), nickname: '손님', state: {} });

    const created = await call('/api/guilds', 'POST', leader, { body: { name: '강화선단' } });
    const guildId = (created.body as { id: string }).id;
    await call('/api/guilds/:id', 'PATCH', leader, { params: { id: guildId }, body: { joinMode: 'open' } });
    const code = ((await call('/api/guilds/me', 'GET', leader)).body as { guild: { code: string } }).guild.code;
    await call('/api/guild-memberships', 'POST', member, { body: { code } });

    // Lv.5까지는 강화 포인트가 없다
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2030-01-01', 0, 100000)`, [guildId]);
    expect(await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'sell' } }))
      .toMatchObject({ status: 409, body: { error: 'enhance-locked' } });

    // Lv.10(누적 1,100,000) 도달 -> 5포인트
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2030-01-02', 0, 1000000)`, [guildId]);
    // 기본 단계(sell=2, pool=123456)가 5가 아니어도 자유 강화 가능
    await env.client.query(`insert into public.guild_bonuses (guild_id, bonus, rank, pool) values ($1, 'sell', 2, 123456)`, [guildId]);

    expect(await call(enhancePath, 'POST', outsider, { params: { id: guildId, bonus: 'sell' } }))
      .toMatchObject({ status: 404, body: { error: 'not-member' } });
    expect(await call(enhancePath, 'POST', guest, { params: { id: guildId, bonus: 'sell' } }))
      .toMatchObject({ status: 403, body: { error: 'account-only' } });
    expect(await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'nope' } }))
      .toMatchObject({ status: 400, body: { error: 'bad-bonus' } });

    for (let i = 1; i <= 5; i++) {
      expect(await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'rare' } }))
        .toMatchObject({ status: 201, body: { enhanceRank: i, remainingPoints: 5 - i } });
    }
    expect(await call(enhancePath, 'POST', leader, { params: { id: guildId, bonus: 'rare' } }))
      .toMatchObject({ status: 409, body: { error: 'enhance-maxed' } });
    expect(await call(enhancePath, 'POST', leader, { params: { id: guildId, bonus: 'sell' } }))
      .toMatchObject({ status: 409, body: { error: 'no-enhance-points' } });

    // 20,000,000G 미만이면 초기화 거부
    expect(await call(resetPath, 'POST', leader, { params: { id: guildId } }))
      .toMatchObject({ status: 409, body: { error: 'not-enough-gold' } });
    expect(await call(resetPath, 'POST', outsider, { params: { id: guildId } }))
      .toMatchObject({ status: 404, body: { error: 'not-member' } });

    // 일반 길드원도 20,000,000G로 즉시 초기화 (기본 기부 rank·pool은 유지)
    expect(await call(resetPath, 'POST', member, { params: { id: guildId } }))
      .toMatchObject({ status: 200, body: { gold: 25_000_000, recovered: 5 } });
    expect(await goldOf(member)).toBe(25_000_000);
    expect(await call(resetPath, 'POST', member, { params: { id: guildId } }))
      .toMatchObject({ status: 409, body: { error: 'no-enhance-used' } });

    // 쿨다운 없음 — 바로 다시 투자 후 같은 시각에 두 번째 초기화 가능
    expect(await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'sell' } }))
      .toMatchObject({ status: 201, body: { enhanceRank: 1, remainingPoints: 4 } });
    expect(await call(resetPath, 'POST', member, { params: { id: guildId } }))
      .toMatchObject({ status: 200, body: { gold: 5_000_000, recovered: 1 } });

    // 재투자 후 조회 검증: 기본 sell(rank=2, pool=123456) 보존 + 자유 강화 sell=3 -> totalRank=5, effect=+10%
    await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'sell' } });
    await call(enhancePath, 'POST', leader, { params: { id: guildId, bonus: 'sell' } });
    await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'sell' } });

    const view = (await call('/api/guilds/me', 'GET', member)).body as {
      guild: {
        growth: { level: number; next: number | null };
        effects: Record<string, number>;
        bonuses: { id: string; rank: number; enhanceRank: number; totalRank: number; pool: number; effect: number }[];
        logbook: { kind: string; detail: string | null; value: number | null }[];
      };
    };
    expect(view.guild.growth).toMatchObject({ level: 10, next: null });
    expect(view.guild.bonuses[0]).toMatchObject({ id: 'sell', rank: 2, enhanceRank: 3, totalRank: 5, pool: 123_456, effect: 0.1 });
    expect(view.guild.effects.sell).toBe(0.1);
    expect(view.guild.logbook.slice(0, 4).map(l => [l.kind, l.detail, l.value])).toEqual([
      ['enhance', 'sell', 3],
      ['enhance', 'sell', 2],
      ['enhance', 'sell', 1],
      ['enhance-reset', null, 1],
    ]);
  });

  it('액션 경로(판매·가방·돌연변이)는 기본 5 + 자유 강화 5 = 최대 10단계 합산 효과를 적용한다', async () => {
    const bag = [fish('crucian'), fish('crucian')];
    const baseSell = bag.reduce((a, i) => a + priceOfInstance(i), 0);
    const uid = await seedUser(env.client, { uid: testUid(nextUid++), email: `ea${nextUid}@test.dev`, state: { gold: 0, boat: 0, bag } });
    const { rows: [g] } = await env.client.query<{ id: string }>(
      `insert into public.guilds (name, code) values ($1, upper(substr(md5(random()::text), 1, 8))) returning id`, [`act${nextUid}`]);
    await env.client.query(`insert into public.guild_members (guild_id, user_id, role) values ($1, $2, 'member')`, [g.id, uid]);
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2030-01-01', 0, 1100000)`, [g.id]);
    await env.client.query(
      `insert into public.guild_bonuses (guild_id, bonus, rank, enhance_rank) values ($1, 'sell', 5, 5), ($1, 'mutation', 5, 5)`,
      [g.id],
    );

    // 판매가 10단계(+20%)
    expect((await callAction(userToken(uid), { type: 'sell', uids: bag.map(i => i.uid) })).status).toBe(200);
    expect(await goldOf(uid)).toBe(baseSell + Math.round(baseSell * 0.2));

    // 돌연변이 10단계(+10%p)
    const r = variantShare(mutationWeightsOf(newState(), 'pond')) + 0.08;
    vi.spyOn(Math, 'random').mockReturnValue(r);
    vi.setSystemTime(Date.now() + 2_000);
    const caught = await callAction(userToken(uid), { type: 'catch', spot: 'pond', judgment: 'auto' });
    expect(caught.status).toBe(200);
    expect((caught.body as { result: { info: { form: string } } }).result.info.form).toBe('variant');

    // 가방 10단계(+40%)
    const cap10 = capOfBoat(0) + Math.round(capOfBoat(0) * 0.4);
    const nearFull = Array.from({ length: cap10 - 1 }, () => fish('crucian'));
    const bagUser = await seedUser(env.client, { uid: testUid(nextUid++), email: `eb${nextUid}@test.dev`, state: { boat: 0, bag: nearFull } });
    const { rows: [g2] } = await env.client.query<{ id: string }>(
      `insert into public.guilds (name, code) values ($1, upper(substr(md5(random()::text), 1, 8))) returning id`, [`bag${nextUid}`]);
    await env.client.query(`insert into public.guild_members (guild_id, user_id, role) values ($1, $2, 'leader')`, [g2.id, bagUser]);
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2030-01-01', 0, 1100000)`, [g2.id]);
    await env.client.query(`insert into public.guild_bonuses (guild_id, bonus, rank, enhance_rank) values ($1, 'bag', 5, 5)`, [g2.id]);

    const bagCatch = await callAction(userToken(bagUser), { type: 'catch', spot: 'pond', judgment: 'auto' });
    expect((bagCatch.body as { result: { released: unknown[] } }).result.released).toEqual([]);
  });
});
