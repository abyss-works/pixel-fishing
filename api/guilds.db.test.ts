// 길드 함수 — 실제 Postgres에서 계정 전용, 만들기·이름 바꾸기·가입 방식·코드로 들어오기·가입 신청 처리·떠나기·내보내기·위임·보너스 기부와
// 응답 형식, 소속 변경 알림과 실시간 알림을 검사한다.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedUser, startActionEnv, testUid, sessionHeaders, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';
import { provideNotify, providePresence } from './_server/livePresence.js';
import type { ServerMessage } from '../src/game/rules/live.js';
import { guildRoutes } from './guilds.js';

let env: ActionEnv;
const A = testUid(971);
const B = testUid(972);
const C = testUid(973);
const GUEST = testUid(974);
const D = testUid(975);
const E = testUid(976);

const changes: [string, string | null][] = [];
const notes: [string, ServerMessage][] = [];
provideNotify((uid, msg) => { notes.push([uid, msg]); });
const routes = guildRoutes((uid, guild) => { changes.push([uid, guild]); });

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: A, email: 'ga@test.dev', nickname: '가람', state: {} });
  await seedUser(env.client, { uid: B, email: 'gb@test.dev', nickname: '나루', state: {} });
  await seedUser(env.client, { uid: C, email: 'gc@test.dev', nickname: '다온', state: {} });
  await seedUser(env.client, { uid: GUEST, nickname: '손님', state: {} });
  await seedUser(env.client, { uid: D, email: 'gd@test.dev', nickname: '라온', state: { gold: 200_000 } });
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

interface MeBody {
  guild: { id: string; name: string; role: string; code: string; joinMode: string; pitch: string | null;
    requests: { uid: string; nick: string }[];
    members: { uid: string; nick: string; role: string; online: boolean; leftAt: string | null }[] } | null;
  request: { code: string; name: string } | null;
}
const mine = async (who: string) => (await call('/api/guilds/me', 'GET', who)).body as MeBody;

describe('길드 함수', () => {
  it('세션이 없으면 401, 게스트는 403, 메서드가 틀리면 405다', async () => {
    expect(await call('/api/guilds/me', 'GET', null)).toMatchObject({ status: 401 });
    expect(await call('/api/guilds', 'POST', GUEST, { body: { name: '손님길드' } })).toMatchObject({ status: 403, body: { error: 'account-only' } });
    expect(await call('/api/guild-memberships', 'POST', GUEST, { body: { code: 'ABCD2345' } })).toMatchObject({ status: 403 });
    expect(await call('/api/guilds', 'GET', A)).toMatchObject({ status: 405 });
    expect(await mine(A)).toEqual({ guild: null, request: null });
  });

  it('만들고, 가입 방식을 바꿔 코드로 들어오고, 위임·내보내기·떠나기를 거친다', async () => {
    expect(await call('/api/guilds', 'POST', A, { body: { name: '가 나' } })).toMatchObject({ status: 400, body: { error: 'bad-name' } });
    const made = await call('/api/guilds', 'POST', A, { body: { name: ' 심해선단 ' } });
    expect(made).toMatchObject({ status: 201 });
    const id = (made.body as { id: string }).id;
    expect(changes.at(-1)).toEqual([A, id]);
    expect(await call('/api/guilds', 'POST', B, { body: { name: '심해선단' } })).toMatchObject({ status: 409, body: { error: 'name-taken' } });

    const code = (await mine(A)).guild!.code;
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(await call('/api/guilds/:id', 'PATCH', A, { params: { id }, body: { joinMode: 'free' } }))
      .toMatchObject({ status: 400, body: { error: 'bad-join-mode' } });
    expect(await call('/api/guilds/:id', 'PATCH', A, { params: { id }, body: { pitch: '가'.repeat(61) } }))
      .toMatchObject({ status: 400, body: { error: 'bad-pitch' } });
    expect(await call('/api/guilds/:id', 'PATCH', A, { params: { id }, body: {} })).toMatchObject({ status: 400, body: { error: 'bad-settings' } });
    expect(await call('/api/guilds/:id', 'PATCH', A, { params: { id }, body: { joinMode: 'open', pitch: '  같이 낚시해요 ' } }))
      .toMatchObject({ status: 200, body: { joinMode: 'open', pitch: '같이 낚시해요' } });
    expect(await call('/api/guild-memberships', 'POST', B, { body: { code: 'nope' } })).toMatchObject({ status: 400, body: { error: 'bad-code' } });
    expect(await call('/api/guild-memberships', 'POST', B, { body: { code: 'ZZZZ2222' } })).toMatchObject({ status: 404, body: { error: 'bad-code' } });
    expect(await call('/api/guild-memberships', 'POST', B, { body: { code: code.toLowerCase() } }))
      .toMatchObject({ status: 201, body: { id, result: 'joined' } });
    expect(await call('/api/guild-memberships', 'POST', C, { body: { code } })).toMatchObject({ status: 201 });
    expect(changes.at(-1)).toEqual([C, id]);
    expect(await call('/api/guilds/:id', 'PATCH', B, { params: { id }, body: { joinMode: 'closed' } }))
      .toMatchObject({ status: 403, body: { error: 'not-leader' } });

    providePresence(uid => (uid === B ? { uid: B, nick: '나루', boat: 1, region: 'deep', x: 0, y: 0, dir: 0, line: false } : null));
    const view = await mine(A);
    expect(view.guild).toMatchObject({ id, name: '심해선단', role: 'leader', code, joinMode: 'open', pitch: '같이 낚시해요', requests: [] });
    expect(view.guild?.members.map(m => [m.nick, m.role, m.online])).toEqual(
      [['가람', 'leader', false], ['나루', 'member', true], ['다온', 'member', false]]);
    expect((await mine(B)).guild).toMatchObject({ role: 'member', code, requests: [] });
    // 성장·기여·항해일지 — 새 길드는 Lv1이고 판매가 보너스가 비용 없이 1단계다. 만든 사람과 들어온 사람이 항해일지에 남는다
    expect(view.guild).toMatchObject({
      growth: { level: 1, total: 0, floor: 0, next: 10_000 },
      effects: { sell: 0.02, bag: 0, named: 0, rare: 0, mutation: 0 },
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
    expect(await mine(B)).toEqual({ guild: null, request: null });
  });

  it('승인 가입 길드에 코드로 오면 신청이 되어 길드장에게 알리고, 승인과 거절은 신청한 사람에게 알린다', async () => {
    const id = ((await call('/api/guilds', 'POST', A, { body: { name: '승인선단' } })).body as { id: string }).id;
    const code = (await mine(A)).guild!.code;
    notes.length = 0;
    expect(await call('/api/guild-memberships', 'POST', B, { body: { code } })).toMatchObject({ status: 202, body: { id, result: 'requested' } });
    expect(notes).toEqual([[A, { t: 'guild', kind: 'request', guild: '승인선단', nick: '나루' }]]);
    expect(await mine(B)).toMatchObject({ guild: null, request: { code, name: '승인선단' } });
    expect((await mine(A)).guild?.requests.map(r => r.nick)).toEqual(['나루']);
    await call('/api/guild-memberships', 'POST', C, { body: { code } });

    expect(await call('/api/guilds/:id/requests/:uid/approval', 'POST', C, { params: { id, uid: B } })).toMatchObject({ status: 404 });
    expect(await call('/api/guilds/:id/requests/:uid/approval', 'POST', A, { params: { id, uid: B } }))
      .toMatchObject({ status: 201, body: { result: 'approved' } });
    expect(changes.at(-1)).toEqual([B, id]);
    expect(notes.at(-1)).toEqual([B, { t: 'guild', kind: 'approved', guild: '승인선단', nick: null }]);
    expect(await call('/api/guilds/:id/requests/:uid', 'DELETE', A, { params: { id, uid: C } }))
      .toMatchObject({ status: 200, body: { result: 'rejected' } });
    expect(notes.at(-1)).toEqual([C, { t: 'guild', kind: 'rejected', guild: '승인선단', nick: null }]);
    expect(await call('/api/guilds/:id/requests/:uid', 'DELETE', A, { params: { id, uid: C } })).toMatchObject({ status: 404, body: { error: 'no-request' } });

    await call('/api/guild-memberships', 'POST', C, { body: { code } });
    expect(await call('/api/guild-requests/me', 'DELETE', C)).toMatchObject({ status: 200, body: { result: 'cancelled' } });
    expect(await mine(C)).toEqual({ guild: null, request: null });

    await call('/api/guilds/:id', 'PATCH', A, { params: { id }, body: { joinMode: 'closed' } });
    expect(await call('/api/guild-memberships', 'POST', C, { body: { code } })).toMatchObject({ status: 409, body: { error: 'guild-closed' } });
    // 정리 — 다음 테스트를 위해 길드를 없앤다
    await call('/api/guilds/:id/members/:uid', 'DELETE', B, { params: { id, uid: B } });
    await call('/api/guilds/:id/members/:uid', 'DELETE', A, { params: { id, uid: A } });
  });

  it('초대 링크로 오면 승인 가입 길드에도 바로 들어오고, 닫힘은 링크로도 받지 않는다. 경로 표시가 없거나 다르면 코드 경로다', async () => {
    const id = ((await call('/api/guilds', 'POST', A, { body: { name: '링크선단' } })).body as { id: string }).id;
    const code = (await mine(A)).guild!.code;
    notes.length = 0;
    expect(await call('/api/guild-memberships', 'POST', B, { body: { code, via: 'code' } })).toMatchObject({ status: 202, body: { result: 'requested' } });
    expect(await call('/api/guild-memberships', 'POST', B, { body: { code, via: 'x' } })).toMatchObject({ status: 202, body: { result: 'requested' } });
    expect(notes).toHaveLength(2);
    expect(await call('/api/guild-memberships', 'POST', B, { body: { code, via: 'link' } }))
      .toMatchObject({ status: 201, body: { id, result: 'joined' } });
    expect(changes.at(-1)).toEqual([B, id]);
    expect(await mine(B)).toMatchObject({ guild: { id, role: 'member' }, request: null });
    await call('/api/guilds/:id', 'PATCH', A, { params: { id }, body: { joinMode: 'closed' } });
    expect(await call('/api/guild-memberships', 'POST', C, { body: { code, via: 'link' } })).toMatchObject({ status: 409, body: { error: 'guild-closed' } });
    await call('/api/guilds/:id/members/:uid', 'DELETE', B, { params: { id, uid: B } });
    await call('/api/guilds/:id/members/:uid', 'DELETE', A, { params: { id, uid: A } });
  });

  it('경로 변수 형식이 틀리면 400이다', async () => {
    expect(await call('/api/guilds/:id', 'PATCH', A, { params: { id: 'x' }, body: { joinMode: 'open' } })).toMatchObject({ status: 400, body: { error: 'bad-guild' } });
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

  it('길드원은 열린 보너스에 기부하고, 내 길드 조회가 보너스 상태와 전체 기부 순위를 싣는다', async () => {
    const made = await call('/api/guilds', 'POST', D, { body: { name: '기부선단' } });
    const id = (made.body as { id: string }).id;
    expect(await donate(D, id, 'sell', 1_000)).toMatchObject({ status: 409, body: { error: 'rank-maxed' } }); // Lv1은 1단계가 상한
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears)
      values ($1, null, '2030-01-01', 0, 10000)`, [id]);
    expect(await donate(GUEST, id, 'sell', 1_000)).toMatchObject({ status: 403, body: { error: 'account-only' } });
    expect(await donate(D, id, 'x', 1_000)).toMatchObject({ status: 400, body: { error: 'bad-bonus' } });
    for (const bad of [0, -5, 1.5, '1000', null]) {
      expect(await donate(D, id, 'sell', bad)).toMatchObject({ status: 400, body: { error: 'bad-amount' } });
    }
    expect(await donate(E, id, 'sell', 1_000)).toMatchObject({ status: 404, body: { error: 'not-member' } });
    expect(await donate(D, id, 'named', 1_000)).toMatchObject({ status: 409, body: { error: 'bonus-locked' } });
    expect(await donate(D, id, 'sell', 200_000)).toMatchObject({ status: 201, body: { rank: 2, pool: 0, accepted: 150_000, gold: 50_000 } });
    expect(await goldOf(D)).toBe(50_000);
    expect(await donate(D, id, 'sell', 1_000)).toMatchObject({ status: 409, body: { error: 'rank-maxed' } });
    expect(await donate(D, id, 'bag', 60_000)).toMatchObject({ status: 409, body: { error: 'not-enough-gold' } });
    expect(await goldOf(D)).toBe(50_000);

    const view = (await call('/api/guilds/me', 'GET', D)).body as { guild: {
      effects: Record<string, number>; bonuses: Record<string, unknown>[]; donors: unknown[];
      logbook: { kind: string; detail: string; value: number }[] } };
    expect(view.guild.effects).toEqual({ sell: 0.04, bag: 0.04, named: 0, rare: 0, mutation: 0 });
    expect(view.guild.bonuses.map(b => b.id)).toEqual(['sell', 'bag', 'named', 'rare', 'mutation']);
    expect(view.guild.bonuses[0]).toEqual({ id: 'sell', unlock: 1, rank: 2, cap: 2, pool: 0, next: 500_000, effect: 0.04,
      nextEffect: 0.06, mine: 150_000 });
    expect(view.guild.bonuses[2]).toMatchObject({ id: 'named', unlock: 3, rank: 0, cap: 0 });
    expect(view.guild.donors).toEqual([{ uid: D, nick: '라온', gold: 150_000 }]);
    expect(view.guild.logbook.slice(0, 2).map(l => [l.kind, l.detail, l.value]))
      .toEqual([['bonus-up', 'sell', 2], ['donate', 'sell', 150_000]]);
  });
});

describe('길드 이름 바꾸기 함수', () => {
  const F = testUid(977);
  const G = testUid(978);
  const rename = (who: string | null, id: string, name: unknown) => call('/api/guilds/:id/name', 'PUT', who, { params: { id }, body: { name } });
  const goldOf = async (uid: string) => Number((await env.client.query<{ gold: string }>(
    'select gold from public.saves_current where user_id = $1', [uid])).rows[0].gold);

  it('길드장이 골드 10만을 내고 하루에 한 번 바꾼다. 내 길드 조회와 항해일지가 새 이름을 보인다', async () => {
    await seedUser(env.client, { uid: F, email: 'gf@test.dev', nickname: '바람', state: { gold: 250_000 } });
    await seedUser(env.client, { uid: G, email: 'gg@test.dev', nickname: '노을', state: { gold: 500_000 } });
    const id = ((await call('/api/guilds', 'POST', F, { body: { name: '옛이름' } })).body as { id: string }).id;
    expect(await call('/api/guilds/:id/name', 'GET', F, { params: { id } })).toMatchObject({ status: 405 });
    expect(await rename(null, id, '새이름')).toMatchObject({ status: 401 });
    expect(await rename(GUEST, id, '새이름')).toMatchObject({ status: 403, body: { error: 'account-only' } });
    expect(await call('/api/guilds/:id/name', 'PUT', F, { params: { id: 'x' }, body: { name: '새이름' } }))
      .toMatchObject({ status: 400, body: { error: 'bad-guild' } });
    expect(await rename(F, id, '가 나')).toMatchObject({ status: 400, body: { error: 'bad-name' } });
    expect(await rename(F, id, undefined)).toMatchObject({ status: 400, body: { error: 'bad-name' } });
    expect(await rename(F, id, '옛이름')).toMatchObject({ status: 400, body: { error: 'same-name' } });
    expect(await rename(F, id, '기부선단')).toMatchObject({ status: 409, body: { error: 'name-taken' } });
    expect(await rename(G, id, '새이름')).toMatchObject({ status: 404, body: { error: 'not-member' } });
    expect(await goldOf(F)).toBe(250_000);
    expect(await rename(F, id, ' 새이름 ')).toMatchObject({ status: 200, body: { name: '새이름', gold: 150_000 } });
    expect(await goldOf(F)).toBe(150_000);
    expect(await rename(F, id, '또새이름')).toMatchObject({ status: 409, body: { error: 'renamed-today' } });
    const view = (await call('/api/guilds/me', 'GET', F)).body as { guild: {
      name: string; renamedAt: string | null; logbook: { kind: string; detail: string }[] } };
    expect(view.guild.name).toBe('새이름');
    expect(view.guild.renamedAt).not.toBeNull();
    expect(view.guild.logbook[0]).toMatchObject({ kind: 'rename', detail: '새이름' });
  });

  it('길드원은 바꿀 수 없고, 길드장이라도 골드가 모자라면 바꿀 수 없다', async () => {
    const H = testUid(979);
    const I = testUid(980);
    await seedUser(env.client, { uid: H, email: 'gh@test.dev', nickname: '파도', state: { gold: 99_999 } });
    await seedUser(env.client, { uid: I, email: 'gi@test.dev', nickname: '물결', state: { gold: 500_000 } });
    const id = ((await call('/api/guilds', 'POST', H, { body: { name: '가난선단' } })).body as { id: string }).id;
    await call('/api/guilds/:id', 'PATCH', H, { params: { id }, body: { joinMode: 'open' } });
    const code = ((await call('/api/guilds/me', 'GET', H)).body as { guild: { code: string } }).guild.code;
    await call('/api/guild-memberships', 'POST', I, { body: { code } });
    expect(await rename(I, id, '길드원이름')).toMatchObject({ status: 403, body: { error: 'not-leader' } });
    expect(await rename(H, id, '모자람')).toMatchObject({ status: 409, body: { error: 'not-enough-gold' } });
    expect(await goldOf(H)).toBe(99_999);
    expect(await goldOf(I)).toBe(500_000);
  });
});
