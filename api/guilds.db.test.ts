// 길드 함수 — 실제 Postgres에서 계정 전용, 만들기·초대·가입·떠나기·내보내기·위임·보너스 기부와 응답 형식, 소속 변경 알림을 검사한다.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedUser, startActionEnv, testUid, sessionHeaders, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';
import { providePresence } from './_server/livePresence.js';
import { guildRoutes } from './guilds.js';

let env: ActionEnv;
const A = testUid(971);
const B = testUid(972);
const C = testUid(973);
const GUEST = testUid(974);
const D = testUid(975);
const E = testUid(976);

const changes: [string, string | null][] = [];
const routes = guildRoutes((uid, guild) => { changes.push([uid, guild]); });

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: A, email: 'ga@test.dev', nickname: '가람', state: {} });
  await seedUser(env.client, { uid: B, email: 'gb@test.dev', nickname: '나루', state: {} });
  await seedUser(env.client, { uid: C, email: 'gc@test.dev', nickname: '다온', state: {} });
  await seedUser(env.client, { uid: GUEST, nickname: '손님', state: {} });
  await seedUser(env.client, { uid: D, email: 'gd@test.dev', nickname: '라온', state: { gold: 120_000 } });
  await seedUser(env.client, { uid: E, email: 'ge@test.dev', nickname: '마루', state: { gold: 1_000_000 } });
});
afterAll(async () => {
  await env?.stop();
});
afterEach(() => providePresence(() => null));

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

interface MeBody { guild: { id: string; name: string; role: string; invite: { code: string } | null;
  members: { uid: string; nick: string; role: string; online: boolean; leftAt: string | null }[] } | null }
const mine = async (who: string) => (await call('/api/guilds/me', 'GET', who)).body as MeBody;

describe('길드 함수', () => {
  it('세션이 없으면 401, 게스트는 403, 메서드가 틀리면 405다', async () => {
    expect(await call('/api/guilds/me', 'GET', null)).toMatchObject({ status: 401 });
    expect(await call('/api/guilds', 'POST', GUEST, { body: { name: '손님길드' } })).toMatchObject({ status: 403, body: { error: 'account-only' } });
    expect(await call('/api/guild-memberships', 'POST', GUEST, { body: { code: 'ABCD2345' } })).toMatchObject({ status: 403 });
    expect(await call('/api/guilds', 'GET', A)).toMatchObject({ status: 405 });
    expect(await mine(A)).toEqual({ guild: null });
  });

  it('만들고, 코드를 발급해 가입하고, 위임·내보내기·떠나기를 거친다', async () => {
    expect(await call('/api/guilds', 'POST', A, { body: { name: '가 나' } })).toMatchObject({ status: 400, body: { error: 'bad-name' } });
    const made = await call('/api/guilds', 'POST', A, { body: { name: ' 심해선단 ' } });
    expect(made).toMatchObject({ status: 201 });
    const id = (made.body as { id: string }).id;
    expect(changes.at(-1)).toEqual([A, id]);
    expect(await call('/api/guilds', 'POST', B, { body: { name: '심해선단' } })).toMatchObject({ status: 409, body: { error: 'name-taken' } });

    const issued = await call('/api/guilds/:id/invites', 'POST', A, { params: { id } });
    expect(issued).toMatchObject({ status: 201, body: { code: expect.stringMatching(/^[A-HJKMNP-Z2-9]{8}$/) } });
    const code = (issued.body as { code: string }).code;
    expect(await call('/api/guild-memberships', 'POST', B, { body: { code: 'nope' } })).toMatchObject({ status: 400, body: { error: 'bad-code' } });
    expect(await call('/api/guild-memberships', 'POST', B, { body: { code: 'ZZZZ2222' } })).toMatchObject({ status: 404, body: { error: 'bad-code' } });
    expect(await call('/api/guild-memberships', 'POST', B, { body: { code: code.toLowerCase() } })).toMatchObject({ status: 201, body: { id } });
    expect(await call('/api/guild-memberships', 'POST', C, { body: { code } })).toMatchObject({ status: 201 });
    expect(changes.at(-1)).toEqual([C, id]);
    expect(await call('/api/guilds/:id/invites', 'POST', B, { params: { id } })).toMatchObject({ status: 403, body: { error: 'not-leader' } });

    providePresence(uid => (uid === B ? { uid: B, nick: '나루', boat: 1, region: 'deep', x: 0, y: 0, dir: 0, line: false } : null));
    const view = await mine(A);
    expect(view.guild).toMatchObject({ id, name: '심해선단', role: 'leader', invite: { code } });
    expect(view.guild?.members.map(m => [m.nick, m.role, m.online])).toEqual(
      [['가람', 'leader', false], ['나루', 'member', true], ['다온', 'member', false]]);
    expect((await mine(B)).guild).toMatchObject({ role: 'member', invite: null });
    // 성장·기여·항해일지 — 새 길드는 Lv1이고 보너스 효과가 없다. 만든 사람과 들어온 사람이 항해일지에 남는다
    expect(view.guild).toMatchObject({
      growth: { level: 1, total: 0, floor: 0, next: 10_000 },
      effects: { sell: 0, bag: 0, named: 0, rare: 0, mutation: 0 },
      members: [{ contribution: { total: 0, today: 0 } }, { contribution: { total: 0, today: 0 } }, { contribution: { total: 0, today: 0 } }],
    });
    expect((view.guild as unknown as { logbook: { kind: string; nick: string }[] }).logbook.map(l => [l.kind, l.nick]))
      .toEqual([['join', '다온'], ['join', '나루'], ['join', '가람']]);

    expect(await call('/api/guilds/:id/members/:uid', 'DELETE', B, { params: { id, uid: C } })).toMatchObject({ status: 403 });
    expect(await call('/api/guilds/:id/members/:uid', 'DELETE', A, { params: { id, uid: A } }))
      .toMatchObject({ status: 409, body: { error: 'handover-first' } });
    expect(await call('/api/guilds/:id/members/:uid', 'DELETE', A, { params: { id, uid: C } }))
      .toMatchObject({ status: 200, body: { result: 'kicked' } });
    expect(changes.at(-1)).toEqual([C, null]);
    expect(await call('/api/guilds/:id/leader', 'PUT', A, { params: { id }, body: { uid: 'x' } })).toMatchObject({ status: 400 });
    expect(await call('/api/guilds/:id/leader', 'PUT', A, { params: { id }, body: { uid: C } })).toMatchObject({ status: 404 });
    expect(await call('/api/guilds/:id/leader', 'PUT', A, { params: { id }, body: { uid: B } }))
      .toMatchObject({ status: 200, body: { result: 'handed-over' } });
    expect(await call('/api/guilds/:id/members/:uid', 'DELETE', A, { params: { id, uid: A } }))
      .toMatchObject({ status: 200, body: { result: 'left' } });
    expect(changes.at(-1)).toEqual([A, null]);
    const after = await mine(B);
    expect(after.guild?.members.map(m => [m.nick, m.role, m.leftAt === null])).toEqual(
      [['나루', 'leader', true], ['가람', 'member', false], ['다온', 'member', false]]);
    expect(await call('/api/guilds/:id/members/:uid', 'DELETE', B, { params: { id, uid: B } }))
      .toMatchObject({ status: 200, body: { result: 'dissolved' } });
    expect(await mine(B)).toEqual({ guild: null });
  });

  it('경로 변수 형식이 틀리면 400이다', async () => {
    expect(await call('/api/guilds/:id/invites', 'POST', A, { params: { id: 'x' } })).toMatchObject({ status: 400, body: { error: 'bad-guild' } });
    expect(await call('/api/guilds/:id/members/:uid', 'DELETE', A, { params: { id: A, uid: 'y' } }))
      .toMatchObject({ status: 400, body: { error: 'bad-user' } });
  });
});

describe('보너스 기부', () => {
  const path = '/api/guilds/:id/bonuses/:bonus/donations';
  const donate = (who: string, id: string, bonus: string, amount: unknown) =>
    call(path, 'POST', who, { params: { id, bonus }, body: { amount } });
  const goldOf = async (uid: string) => Number((await env.client.query<{ gold: string }>(
    'select gold from public.saves_current where user_id = $1', [uid])).rows[0].gold);

  it('길드원은 열린 보너스에 기부하고, 내 길드 조회가 보너스 상태와 기부 순위를 싣는다', async () => {
    const made = await call('/api/guilds', 'POST', D, { body: { name: '기부선단' } });
    const id = (made.body as { id: string }).id;
    expect(await donate(GUEST, id, 'sell', 1_000)).toMatchObject({ status: 403, body: { error: 'account-only' } });
    expect(await donate(D, id, 'x', 1_000)).toMatchObject({ status: 400, body: { error: 'bad-bonus' } });
    for (const bad of [0, -5, 1.5, '1000', null]) {
      expect(await donate(D, id, 'sell', bad)).toMatchObject({ status: 400, body: { error: 'bad-amount' } });
    }
    expect(await donate(E, id, 'sell', 1_000)).toMatchObject({ status: 404, body: { error: 'not-member' } });
    expect(await donate(D, id, 'bag', 1_000)).toMatchObject({ status: 409, body: { error: 'bonus-locked' } });
    expect(await donate(D, id, 'sell', 200_000)).toMatchObject({ status: 201, body: { rank: 1, pool: 0, accepted: 100_000, gold: 20_000 } });
    expect(await goldOf(D)).toBe(20_000);
    expect(await donate(D, id, 'sell', 1_000)).toMatchObject({ status: 409, body: { error: 'rank-maxed' } });

    const view = (await call('/api/guilds/me', 'GET', D)).body as { guild: {
      effects: Record<string, number>; bonuses: Record<string, unknown>[]; logbook: { kind: string; detail: string; value: number }[] } };
    expect(view.guild.effects).toEqual({ sell: 0.02, bag: 0, named: 0, rare: 0, mutation: 0 });
    expect(view.guild.bonuses.map(b => b.id)).toEqual(['sell', 'bag', 'named', 'rare', 'mutation']);
    expect(view.guild.bonuses[0]).toEqual({ id: 'sell', unlock: 1, rank: 1, cap: 1, pool: 0, next: 250_000, effect: 0.02,
      nextEffect: 0.04, mine: 100_000, donors: [{ uid: D, nick: '라온', gold: 100_000 }] });
    expect(view.guild.bonuses[1]).toMatchObject({ id: 'bag', unlock: 2, rank: 0, cap: 0 });
    expect(view.guild.logbook.slice(0, 2).map(l => [l.kind, l.detail, l.value]))
      .toEqual([['bonus-up', 'sell', 1], ['donate', 'sell', 100_000]]);

    // 레벨이 오르면 상한이 늘어 다시 기부할 수 있다. 가진 골드보다 많이 받아야 하면 거부한다
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears)
      values ($1, null, '2030-01-01', 0, 10000)`, [id]);
    expect(await donate(D, id, 'sell', 30_000)).toMatchObject({ status: 409, body: { error: 'not-enough-gold' } });
    expect(await goldOf(D)).toBe(20_000);
  });
});
