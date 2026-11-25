// 길드 10레벨 확장 및 개인 스킬 자유 강화 — 실제 Postgres에서 마이그레이션 0040·0041 제약, 길드원별 독립 자유 강화·누적 횟수별 초기화(쿨다운 없음),
// 항해일지 비기록(옛 기록 읽기 호환), 탈퇴·추방 시 개인 강화 정리, 그리고 액션 경로의 개인별 합산 효과(기본 + 개인 자유 강화, 최대 10단계)를 검사한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SNAPSHOT_EVERY } from '../src/game/rules/balance.js';
import { GUILD_ENHANCE_RESET_COSTS } from '../src/game/rules/guild.js';
import { capOfBoat, mutationWeightsOf, newState, priceOfInstance, variantShare } from '../src/game/rules/logic.js';
import { database } from './_db/client.js';
import { loadContext } from './_data/load.js';
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

  it('0040 스키마 및 옛 항해일지 호환: guild_member_enhancements는 0~5만 허용하고 guild_logs의 기존 enhance·enhance-reset 읽기를 유지한다', async () => {
    const uid = await seedUser(env.client, { uid: testUid(nextUid++), email: `e${nextUid}@test.dev`, state: {} });
    const { rows: [g] } = await env.client.query<{ id: string }>(
      `insert into public.guilds (name, code) values ($1, upper(substr(md5(random()::text), 1, 8))) returning id`, [`g${nextUid}`]);
    await env.client.query(`insert into public.guild_members (guild_id, user_id, role) values ($1, $2, 'leader')`, [g.id, uid]);
    await expect(env.client.query(`insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank) values ($1, $2, 'sell', 6)`, [g.id, uid]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(env.client.query(`insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank) values ($1, $2, 'sell', -1)`, [g.id, uid]))
      .rejects.toMatchObject({ code: '23514' });
    await env.client.query(`insert into public.guild_logs (guild_id, user_id, kind, detail, value) values ($1, $2, 'enhance', 'sell', 1)`, [g.id, uid]);
    await env.client.query(`insert into public.guild_logs (guild_id, user_id, kind, value) values ($1, $2, 'enhance-reset', 1)`, [g.id, uid]);
    const view = (await call('/api/guilds/me', 'GET', uid)).body as {
      guild: { logbook: { kind: string; detail: string | null; value: number | null }[] };
    };
    expect(view.guild.logbook.map(l => [l.kind, l.detail, l.value])).toEqual([
      ['enhance-reset', null, 1],
      ['enhance', 'sell', 1],
    ]);
  });

  it('길드원 각자가 독립 포인트로 다른 스킬에 투자하고, 본인 초기화·공용 항해일지 비기록을 지킨다', async () => {
    const leader = await seedUser(env.client, { uid: testUid(nextUid++), email: `el${nextUid}@test.dev`, nickname: '선장', state: { gold: 50_000 } });
    const member = await seedUser(env.client, { uid: testUid(nextUid++), email: `em${nextUid}@test.dev`, nickname: '선원', state: { gold: 600_000 } });
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

    // Lv.10(누적 1,100,000) 도달 -> 각 길드원당 5포인트
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2030-01-02', 0, 1000000)`, [guildId]);
    // 기본 단계(sell=2, pool=123456)가 5가 아니어도 자유 강화 가능
    await env.client.query(`insert into public.guild_bonuses (guild_id, bonus, rank, pool) values ($1, 'sell', 2, 123456)`, [guildId]);

    expect(await call(enhancePath, 'POST', outsider, { params: { id: guildId, bonus: 'sell' } }))
      .toMatchObject({ status: 404, body: { error: 'not-member' } });
    expect(await call(enhancePath, 'POST', guest, { params: { id: guildId, bonus: 'sell' } }))
      .toMatchObject({ status: 403, body: { error: 'account-only' } });
    expect(await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'nope' } }))
      .toMatchObject({ status: 400, body: { error: 'bad-bonus' } });

    // 선원: rare 5투자 -> 본인 상한·포인트 소진
    for (let i = 1; i <= 5; i++) {
      expect(await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'rare' } }))
        .toMatchObject({ status: 201, body: { enhanceRank: i, remainingPoints: 5 - i } });
    }
    expect(await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'rare' } }))
      .toMatchObject({ status: 409, body: { error: 'enhance-maxed' } });
    expect(await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'sell' } }))
      .toMatchObject({ status: 409, body: { error: 'no-enhance-points' } });

    // 선장은 독립된 5포인트를 가지므로 다른 스킬(sell)에 5투자 가능
    for (let i = 1; i <= 5; i++) {
      expect(await call(enhancePath, 'POST', leader, { params: { id: guildId, bonus: 'sell' } }))
        .toMatchObject({ status: 201, body: { enhanceRank: i, remainingPoints: 5 - i } });
    }

    // 첫 회차 비용(100,000G) 미만이면 초기화 거부
    expect(await call(resetPath, 'POST', leader, { params: { id: guildId } }))
      .toMatchObject({ status: 409, body: { error: 'not-enough-gold' } });
    expect(await call(resetPath, 'POST', outsider, { params: { id: guildId } }))
      .toMatchObject({ status: 404, body: { error: 'not-member' } });

    // 선원이 1회차 비용(100,000G)으로 초기화 -> 선원의 포인트만 회수되고 선장의 sell 5단계·기본 기부 rank/pool은 유지
    expect(await call(resetPath, 'POST', member, { params: { id: guildId } }))
      .toMatchObject({ status: 200, body: { gold: 500_000, recovered: 5, enhanceResetCount: 1 } });
    expect(await goldOf(member)).toBe(500_000);
    expect(await call(resetPath, 'POST', member, { params: { id: guildId } }))
      .toMatchObject({ status: 409, body: { error: 'no-enhance-used' } });

    // 쿨다운 없음 — 선원이 다시 bag에 1투자 후 2회차 비용(500,000G)으로 즉시 두 번째 초기화
    expect(await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'bag' } }))
      .toMatchObject({ status: 201, body: { enhanceRank: 1, remainingPoints: 4 } });
    expect(await call(resetPath, 'POST', member, { params: { id: guildId } }))
      .toMatchObject({ status: 200, body: { gold: 0, recovered: 1, enhanceResetCount: 2 } });

    // 선원이 sell 2 + bag 1로 재투자한 뒤 GET /api/guilds/me는 각자의 투자 효과와 누적 초기화 횟수를 반환한다
    await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'sell' } });
    await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'sell' } });
    await call(enhancePath, 'POST', member, { params: { id: guildId, bonus: 'bag' } });

    interface GuildMe {
      guild: {
        growth: { level: number; next: number | null };
        effects: Record<string, number>;
        enhanceResetCount: number;
        bonuses: { id: string; rank: number; enhanceRank: number; totalRank: number; pool: number; effect: number }[];
        logbook: { kind: string; detail: string | null; value: number | null }[];
      };
    }
    const memberView = ((await call('/api/guilds/me', 'GET', member)).body as GuildMe).guild;
    expect(memberView.growth).toMatchObject({ level: 10, next: null });
    expect(memberView.enhanceResetCount).toBe(2);
    expect(memberView.bonuses[0]).toMatchObject({ id: 'sell', rank: 2, enhanceRank: 2, totalRank: 4, pool: 123_456, effect: 0.08 });
    expect(memberView.bonuses[1]).toMatchObject({ id: 'bag', rank: 1, enhanceRank: 1, totalRank: 2, effect: 0.08 });
    expect(memberView.effects.sell).toBe(0.08);
    expect(memberView.effects.bag).toBe(0.08);

    const leaderView = ((await call('/api/guilds/me', 'GET', leader)).body as GuildMe).guild;
    expect(leaderView.enhanceResetCount).toBe(0);
    expect(leaderView.bonuses[0]).toMatchObject({ id: 'sell', rank: 2, enhanceRank: 5, totalRank: 7, pool: 123_456, effect: 0.14 });
    expect(leaderView.bonuses[1]).toMatchObject({ id: 'bag', rank: 1, enhanceRank: 0, totalRank: 1, effect: 0.04 });
    expect(leaderView.effects.sell).toBe(0.14);
    expect(leaderView.effects.bag).toBe(0.04);

    // 개인 자유 강화와 초기화는 공용 항해일지에 남지 않는다
    const { rows: enhanceLogs } = await env.client.query<{ kind: string }>(
      `select kind from public.guild_logs where guild_id = $1 and kind in ('enhance', 'enhance-reset')`,
      [guildId],
    );
    expect(enhanceLogs).toEqual([]);
  });

  it('같은 길드의 두 길드원이 서로 다른 자유 강화를 두면 loadContext와 액션(판매·가방·돌연변이)에 각자의 효과만 적용된다', async () => {
    const bagA = [fish('crucian'), fish('crucian')];
    const bagB = [fish('crucian'), fish('crucian')];
    const baseSell = bagA.reduce((a, i) => a + priceOfInstance(i), 0);
    const u1 = await seedUser(env.client, { uid: testUid(nextUid++), email: `ea${nextUid}@test.dev`, state: { gold: 0, boat: 0, bag: bagA } });
    const u2 = await seedUser(env.client, { uid: testUid(nextUid++), email: `eb${nextUid}@test.dev`, state: { gold: 0, boat: 0, bag: bagB } });
    const { rows: [g] } = await env.client.query<{ id: string }>(
      `insert into public.guilds (name, code) values ($1, upper(substr(md5(random()::text), 1, 8))) returning id`, [`act${nextUid}`]);
    await env.client.query(`insert into public.guild_members (guild_id, user_id, role) values ($1, $2, 'leader'), ($1, $3, 'member')`, [g.id, u1, u2]);
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2030-01-01', 0, 1100000)`, [g.id]);
    await env.client.query(
      `insert into public.guild_bonuses (guild_id, bonus, rank) values ($1, 'sell', 5), ($1, 'mutation', 5), ($1, 'bag', 5)`,
      [g.id],
    );
    // u1은 sell=5, mutation=5 / u2는 bag=5
    await env.client.query(
      `insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank)
       values ($1, $2, 'sell', 5), ($1, $2, 'mutation', 5), ($1, $3, 'bag', 5)`,
      [g.id, u1, u2],
    );

    const { db } = database();
    const ctx1 = await loadContext(db, u1, { skipDetailType: false, snapshotEvery: SNAPSHOT_EVERY, bountyDayStart: null, guild: true });
    const ctx2 = await loadContext(db, u2, { skipDetailType: false, snapshotEvery: SNAPSHOT_EVERY, bountyDayStart: null, guild: true });
    expect(ctx1.guild?.enhanceRanks).toEqual({ sell: 5, mutation: 5 });
    expect(ctx2.guild?.enhanceRanks).toEqual({ bag: 5 });

    // u1은 판매가 10단계(+20%), u2는 기본 5단계(+10%)만 적용
    expect((await callAction(userToken(u1), { type: 'sell', uids: bagA.map(i => i.uid) })).status).toBe(200);
    expect(await goldOf(u1)).toBe(baseSell + Math.round(baseSell * 0.2));
    expect((await callAction(userToken(u2), { type: 'sell', uids: bagB.map(i => i.uid) })).status).toBe(200);
    expect(await goldOf(u2)).toBe(baseSell + Math.round(baseSell * 0.1));

    // u1은 돌연변이 10단계(+40% 가중치 = 1.4/4.4 ≈ 0.318) 적용, 기본(0.25)과의 중간값으로 검증
    const baseShare = variantShare(mutationWeightsOf(newState(), 'pond'));
    const boostedShare = variantShare(mutationWeightsOf(newState(), 'pond', 0, 0, 1, 0.4));
    const r = (baseShare + boostedShare) / 2;
    vi.spyOn(Math, 'random').mockReturnValue(r);
    vi.setSystemTime(Date.now() + 2_000);
    const caught = await callAction(userToken(u1), { type: 'catch', spot: 'pond', judgment: 'auto' });
    expect(caught.status).toBe(200);
    expect((caught.body as { result: { info: { form: string } } }).result.info.form).toBe('variant');

    // 가방 10단계(+40%)는 bag=5를 투자한 u2에만 적용되고, bag=0인 u3(같은 길드 다른 멤버)는 기본 5단계(+20%)만 적용된다
    const cap10 = capOfBoat(0) + Math.round(capOfBoat(0) * 0.4);
    const cap5 = capOfBoat(0) + Math.round(capOfBoat(0) * 0.2);
    expect(cap10).toBeGreaterThan(cap5);
    const bagCapUser = await seedUser(env.client, {
      uid: testUid(nextUid++),
      email: `ebag${nextUid}@test.dev`,
      state: { boat: 0, bag: Array.from({ length: cap10 - 1 }, () => fish('crucian')) },
    });
    const baseBagUser = await seedUser(env.client, {
      uid: testUid(nextUid++),
      email: `ebase${nextUid}@test.dev`,
      state: { boat: 0, bag: Array.from({ length: cap10 - 1 }, () => fish('crucian')) },
    });
    const { rows: [g2] } = await env.client.query<{ id: string }>(
      `insert into public.guilds (name, code) values ($1, upper(substr(md5(random()::text), 1, 8))) returning id`, [`bag${nextUid}`]);
    await env.client.query(`insert into public.guild_members (guild_id, user_id, role) values ($1, $2, 'leader'), ($1, $3, 'member')`, [g2.id, bagCapUser, baseBagUser]);
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2030-01-01', 0, 1100000)`, [g2.id]);
    await env.client.query(`insert into public.guild_bonuses (guild_id, bonus, rank) values ($1, 'bag', 5)`, [g2.id]);
    await env.client.query(`insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank) values ($1, $2, 'bag', 5)`, [g2.id, bagCapUser]);

    const bagCatch = await callAction(userToken(bagCapUser), { type: 'catch', spot: 'pond', judgment: 'auto' });
    expect((bagCatch.body as { result: { released: unknown[] } }).result.released).toEqual([]);
    const baseCatch = await callAction(userToken(baseBagUser), { type: 'catch', spot: 'pond', judgment: 'auto' });
    expect((baseCatch.body as { result: { released: unknown[] } }).result.released).toHaveLength(1);
  });

  it('길드 탈퇴·내보내기 시 해당 길드원의 guild_member_enhancements 행만 삭제되고 다른 길드원 행은 남는다', async () => {
    const leader = await seedUser(env.client, { uid: testUid(nextUid++), email: `rl${nextUid}@test.dev`, nickname: '정리선장', state: {} });
    const leaver = await seedUser(env.client, { uid: testUid(nextUid++), email: `rm${nextUid}@test.dev`, nickname: '정리탈퇴', state: {} });
    const kicked = await seedUser(env.client, { uid: testUid(nextUid++), email: `rk${nextUid}@test.dev`, nickname: '정리추방', state: {} });

    const created = await call('/api/guilds', 'POST', leader, { body: { name: '정리선단' } });
    const guildId = (created.body as { id: string }).id;
    await call('/api/guilds/:id', 'PATCH', leader, { params: { id: guildId }, body: { joinMode: 'open' } });
    const code = ((await call('/api/guilds/me', 'GET', leader)).body as { guild: { code: string } }).guild.code;
    await call('/api/guild-memberships', 'POST', leaver, { body: { code } });
    await call('/api/guild-memberships', 'POST', kicked, { body: { code } });
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2030-01-01', 0, 1100000)`, [guildId]);

    await call(enhancePath, 'POST', leader, { params: { id: guildId, bonus: 'sell' } });
    await call(enhancePath, 'POST', leaver, { params: { id: guildId, bonus: 'rare' } });
    await call(enhancePath, 'POST', kicked, { params: { id: guildId, bonus: 'bag' } });

    expect(await call('/api/guilds/:id/members/:uid', 'DELETE', leaver, { params: { id: guildId, uid: leaver } }))
      .toMatchObject({ status: 200, body: { result: 'left' } });
    expect(await call('/api/guilds/:id/members/:uid', 'DELETE', leader, { params: { id: guildId, uid: kicked } }))
      .toMatchObject({ status: 200, body: { result: 'kicked' } });

    const { rows } = await env.client.query<{ user_id: string; bonus: string; rank: number }>(
      `select user_id::text, bonus, rank from public.guild_member_enhancements where guild_id = $1`,
      [guildId],
    );
    expect(rows).toEqual([{ user_id: leader, bonus: 'sell', rank: 1 }]);
  });

  it('연속 초기화 시 계정 누적 횟수에 따라 10만→50만→100만→500만→1,000만 상한으로 비용이 오른다', async () => {
    const steps = [...GUILD_ENHANCE_RESET_COSTS, GUILD_ENHANCE_RESET_COSTS[GUILD_ENHANCE_RESET_COSTS.length - 1]];
    let remainingGold = steps.reduce((a, b) => a + b, 0);
    const uid = await seedUser(env.client, { uid: testUid(nextUid++), email: `step${nextUid}@test.dev`, nickname: '단계선장', state: { gold: remainingGold } });
    const guildId = ((await call('/api/guilds', 'POST', uid, { body: { name: '단계비용선단' } })).body as { id: string }).id;
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2030-01-01', 0, 1100000)`, [guildId]);

    for (let i = 0; i < steps.length; i++) {
      expect(await call(enhancePath, 'POST', uid, { params: { id: guildId, bonus: 'sell' } }))
        .toMatchObject({ status: 201, body: { enhanceRank: 1, remainingPoints: 4 } });
      remainingGold -= steps[i];
      const expectedCount = i + 1;
      expect(await call(resetPath, 'POST', uid, { params: { id: guildId } }))
        .toMatchObject({ status: 200, body: { gold: remainingGold, recovered: 1, enhanceResetCount: expectedCount } });
      expect(await goldOf(uid)).toBe(remainingGold);
      const { rows: [saveRow] } = await env.client.query<{ guild_enhance_reset_count: number }>(
        `select guild_enhance_reset_count from public.saves_current where user_id = $1`,
        [uid],
      );
      expect(saveRow.guild_enhance_reset_count).toBe(expectedCount);
      const me = (await call('/api/guilds/me', 'GET', uid)).body as { guild: { enhanceResetCount: number } };
      expect(me.guild.enhanceResetCount).toBe(expectedCount);
    }
  });

  it('길드 탈퇴 후 다른 길드에 가입해도 계정 누적 초기화 횟수가 유지되어 다음 비용이 이어진다', async () => {
    const leaderA = await seedUser(env.client, { uid: testUid(nextUid++), email: `ma${nextUid}@test.dev`, nickname: '가선장', state: {} });
    const leaderB = await seedUser(env.client, { uid: testUid(nextUid++), email: `mb${nextUid}@test.dev`, nickname: '나선장', state: {} });
    const traveler = await seedUser(env.client, { uid: testUid(nextUid++), email: `tr${nextUid}@test.dev`, nickname: '이적선원', state: { gold: 500_000 } });

    const guildA = ((await call('/api/guilds', 'POST', leaderA, { body: { name: '첫번째선단' } })).body as { id: string }).id;
    await call('/api/guilds/:id', 'PATCH', leaderA, { params: { id: guildA }, body: { joinMode: 'open' } });
    const codeA = ((await call('/api/guilds/me', 'GET', leaderA)).body as { guild: { code: string } }).guild.code;
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2030-01-01', 0, 1100000)`, [guildA]);

    const guildB = ((await call('/api/guilds', 'POST', leaderB, { body: { name: '두번째선단' } })).body as { id: string }).id;
    await call('/api/guilds/:id', 'PATCH', leaderB, { params: { id: guildB }, body: { joinMode: 'open' } });
    const codeB = ((await call('/api/guilds/me', 'GET', leaderB)).body as { guild: { code: string } }).guild.code;
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2030-01-01', 0, 1100000)`, [guildB]);

    // 길드 A에서 1회차 초기화(100,000G 차감, 잔액 400,000G, enhanceResetCount: 1) 후 탈퇴
    await call('/api/guild-memberships', 'POST', traveler, { body: { code: codeA } });
    await call(enhancePath, 'POST', traveler, { params: { id: guildA, bonus: 'sell' } });
    expect(await call(resetPath, 'POST', traveler, { params: { id: guildA } }))
      .toMatchObject({ status: 200, body: { gold: 400_000, recovered: 1, enhanceResetCount: 1 } });
    expect(await call('/api/guilds/:id/members/:uid', 'DELETE', traveler, { params: { id: guildA, uid: traveler } }))
      .toMatchObject({ status: 200, body: { result: 'left' } });

    // 길드 B 가입 후에도 enhanceResetCount=1이 유지되며 2회차 비용(500,000G)이 적용된다
    await call('/api/guild-memberships', 'POST', traveler, { body: { code: codeB } });
    const meB = (await call('/api/guilds/me', 'GET', traveler)).body as { guild: { enhanceResetCount: number } };
    expect(meB.guild.enhanceResetCount).toBe(1);

    await call(enhancePath, 'POST', traveler, { params: { id: guildB, bonus: 'bag' } });
    // 잔액 400,000G < 2회차 500,000G -> 거부
    expect(await call(resetPath, 'POST', traveler, { params: { id: guildB } }))
      .toMatchObject({ status: 409, body: { error: 'not-enough-gold' } });

    // 100,000G 추가 지급 후 2회차(500,000G) 성공 -> 잔액 0G, enhanceResetCount: 2
    await env.client.query(`update public.saves_current set gold = 500000 where user_id = $1`, [traveler]);
    expect(await call(resetPath, 'POST', traveler, { params: { id: guildB } }))
      .toMatchObject({ status: 200, body: { gold: 0, recovered: 1, enhanceResetCount: 2 } });
  });
});
