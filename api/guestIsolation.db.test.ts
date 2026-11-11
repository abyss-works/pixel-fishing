// 게스트 격리 — 게스트(계정을 연결하지 않은 익명 계정)에게 닫는 서버 쪽 규칙을 실제 Postgres에서 검사한다.
// 액션 허용 목록, 랭킹 제외, 공개 프로필 비노출을 다룬다. 채팅과 실시간 채널은 각자의 테스트가 맡는다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callAction, dumpUser, fish, seedUser, sessionHeaders, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

let env: ActionEnv;
let seq = 1000;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});

const guest = (opts: Parameters<typeof seedUser>[1] = {}) => seedUser(env.client, { uid: testUid(seq++), state: {}, ...opts });
const member = (opts: Parameters<typeof seedUser>[1] = {}) =>
  seedUser(env.client, { uid: testUid(seq++), email: `m${seq}@example.com`, state: {}, ...opts });
// 직전 성공 액션과의 최소 간격 검사를 피하려고 매번 마지막 저장 시각을 과거로 돌린다
const send = async (uid: string, action: unknown) => {
  await env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z', last_catch_at = null where user_id = $1`, [uid]);
  return callAction(userToken(uid), action);
};
const outcome = (res: { status: number; body: unknown }) => [res.status, (res.body as { error?: string }).error ?? 'ok'];

describe('게스트 액션 허용 목록', () => {
  it('마을 안의 낚시, 판매, 낚싯대 강화, 배 구매, 이동은 받는다', async () => {
    const uid = await guest({ state: { gold: 100_000, bag: [fish('crucian')] } });
    expect(outcome(await send(uid, { type: 'boot' }))).toEqual([200, 'ok']);
    expect(outcome(await send(uid, { type: 'catch', spot: 'pond', judgment: 'good' }))).toEqual([200, 'ok']);
    expect(outcome(await send(uid, { type: 'sell', uids: [] }))).toEqual([200, 'ok']);
    expect(outcome(await send(uid, { type: 'upgradeRod' }))).toEqual([200, 'ok']);
    expect(outcome(await send(uid, { type: 'buyBoat' }))).toEqual([200, 'ok']);
    expect(outcome(await send(uid, { type: 'travel', to: { kind: 'region', id: 'village' } }))).toEqual([200, 'ok']);
    expect(outcome(await send(uid, { type: 'travel', to: { kind: 'base', id: 'home' } }))).toEqual([200, 'ok']);
  });

  it('바다로 나가는 이동과 마을 밖 낚시는 403 guest-village-only로 거부하고 상태를 바꾸지 않는다', async () => {
    const uid = await guest({ state: { boat: 3, gold: 0 } });
    const before = await dumpUser(env.client, uid);
    expect(outcome(await send(uid, { type: 'travel', to: { kind: 'region', id: 'world' } }))).toEqual([403, 'guest-village-only']);
    expect(outcome(await send(uid, { type: 'travel', to: { kind: 'base', id: 'harbor' } }))).toEqual([403, 'guest-village-only']);
    expect(outcome(await send(uid, { type: 'catch', spot: 'sea', judgment: 'good' }))).toEqual([403, 'guest-village-only']);
    expect(await dumpUser(env.client, uid)).toEqual(before);
  });

  it('닉네임 변경, 편지, 옷장, 의뢰 같은 그 밖의 액션은 403 account-only로 거부하고 아무것도 바꾸지 않는다', async () => {
    const uid = await guest({ state: { gold: 1000 }, nickname: '게스트닉' });
    const before = await dumpUser(env.client, uid);
    const actions = [
      { type: 'setNickname', nickname: '바꿈' }, { type: 'sendLetter', text: '안녕' },
      { type: 'changeClothes', shirt: 1, pants: 1 }, { type: 'buyHat', hat: 'cap' }, { type: 'wearHat', hat: null },
      { type: 'acceptQuest', questId: 'q', port: 'harbor' }, { type: 'redeemCoupon', code: 'x' },
      { type: 'claimMail', id: 1 }, { type: 'exhibit', uid: 'u', slot: 0 },
    ];
    for (const action of actions) expect(outcome(await send(uid, action)), action.type).toEqual([403, 'account-only']);
    expect(await dumpUser(env.client, uid)).toEqual(before);
  });

  it('계정 사용자는 같은 액션을 규칙대로 처리한다', async () => {
    const uid = await member({ state: { boat: 3 }, nickname: '계정닉' });
    expect(outcome(await send(uid, { type: 'travel', to: { kind: 'region', id: 'world' } }))).toEqual([200, 'ok']);
    expect(outcome(await send(uid, { type: 'setNickname', nickname: '바뀜' }))).toEqual([200, 'ok']);
  });

  it('프로필이 없는 게스트가 마을 밖 액션을 보내도 거부하고, 다음 허용 액션은 처리한다', async () => {
    const uid = await guest({ nickname: null });
    expect(outcome(await send(uid, { type: 'travel', to: { kind: 'region', id: 'world' } }))).toEqual([403, 'guest-village-only']);
    expect(outcome(await send(uid, { type: 'boot' }))).toEqual([200, 'ok']);
  });
});

describe('랭킹의 게스트', () => {
  async function rank(query: Record<string, string>, token: string | null) {
    const { default: handler } = await import('./rank.js');
    const out: { status: number; body: unknown } = { status: 0, body: undefined };
    const res = { status(c: number) { out.status = c; return res; }, json(b: unknown) { out.body = b; }, setHeader() {} };
    await handler({ method: 'GET', query, headers: sessionHeaders(token) } as never, res as never);
    return out;
  }
  const dexOf = (id: string) => ({ [id]: { normal: { count: 1, maxSize: 10, first: '2026-01-01T00:00:00Z' } } });

  it('명성, 도감, 어종 순위 어디에도 게스트를 넣지 않고 게스트의 내 순위도 비운다', async () => {
    const g = await guest({ nickname: '게스트고수', state: { fame: 900, dex: dexOf('crucian') } });
    await env.client.query('update public.records set max_size = 99 where user_id = $1', [g]);
    const m = await member({ nickname: '계정하수', state: { fame: 5, dex: dexOf('crucian') } });
    await env.client.query('update public.records set max_size = 10 where user_id = $1', [m]);
    const queries: Record<string, string>[] = [{ board: 'fame' }, { board: 'dex' }, { board: 'species', fish: 'crucian' }];
    for (const query of queries) {
      const asGuest = (await rank(query, userToken(g))).body as { top: { nickname: string }[]; me: unknown };
      expect(asGuest.top.map(r => r.nickname), query.board).toEqual(['계정하수']);
      expect(asGuest.me, query.board).toBeNull();
      const asMember = (await rank(query, userToken(m))).body as { top: { nickname: string }[]; me: { rank: number } };
      expect(asMember.top.map(r => r.nickname), query.board).toEqual(['계정하수']);
      expect(asMember.me.rank, query.board).toBe(1);
    }
  });
});

describe('공개 프로필의 게스트', () => {
  async function profile(uid: string, token: string | null) {
    const { default: handler } = await import('./players.js');
    const out: { status: number; body: unknown } = { status: 0, body: undefined };
    const res = { status(c: number) { out.status = c; return res; }, json(b: unknown) { out.body = b; }, setHeader() {} };
    await handler({ method: 'GET', params: { uid }, headers: sessionHeaders(token) } as never, res as never);
    return out;
  }

  it('다른 사용자는 게스트의 프로필을 읽지 못하고, 게스트 본인은 읽는다', async () => {
    const g = await guest({ nickname: '숨은게스트', state: { fame: 3 } });
    const m = await member({ nickname: '구경꾼' });
    expect(await profile(g, userToken(m))).toMatchObject({ status: 404, body: { error: 'not-found' } });
    expect(await profile(g, userToken(await guest()))).toMatchObject({ status: 404 });
    expect(await profile(g, userToken(g))).toMatchObject({ status: 200, body: { nickname: '숨은게스트' } });
  });
});
