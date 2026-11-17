// 본인 읽기 함수 — 세션 사용자 자신의 저장 상태·수배·프로필만 돌려준다.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fish, seedUser, sessionHeaders, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

let env: ActionEnv;
const ME = testUid(1);
const OTHER = testUid(2);
const LEGACY = testUid(3);
const BAG = [fish('crucian', { size: 31 })];
const ADMIN = testUid(4);
const MEMBER = testUid(5);
const LISTED_GUEST = testUid(6);

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: ME, nickname: '나', state: { gold: 120, fame: 7, bag: BAG }, version: 5 });
  await seedUser(env.client, { uid: OTHER, nickname: '남', state: { gold: 999 } });
  await seedUser(env.client, { uid: LEGACY, nickname: null });
  await env.client.query('insert into public.saves (user_id, data) values ($1, $2)', [LEGACY, { v: 4, gold: 77 }]);
  await seedUser(env.client, { uid: ADMIN, nickname: '운영', email: 'admin@example.test', admin: true });
  await seedUser(env.client, { uid: MEMBER, nickname: '회원', email: 'member@example.test' });
  await seedUser(env.client, { uid: LISTED_GUEST, nickname: '손님', admin: true });
  await env.client.query(`insert into public.bounty_clears (user_id, kind, quest_id, cleared_at) values
    ($1, 'general', 'q-old', now() - interval '3 days'), ($1, 'general', 'q-today', now())`, [ME]);
  await env.client.query(`insert into public.bounty_tickets (user_id, quest_id) values ($1, 'q-ticket')`, [ME]);
});
afterAll(async () => {
  await env?.stop();
});
afterEach(() => { delete process.env.DEPLOY_ENV; });

async function callMe(q: string, token: string | null): Promise<{ status: number; body: unknown }> {
  const { default: handler } = await import('./me.js');
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader() {},
  };
  await handler({ method: 'GET', query: { q }, headers: sessionHeaders(token) } as never, res as never);
  return out;
}

describe('본인 읽기', () => {
  it('세션이 없으면 401이다', async () => {
    expect(await callMe('state', null)).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
  });

  it('state: 본인의 저장 상태와 개체만 준다', async () => {
    const { status, body } = await callMe('state', userToken(ME));
    expect(status).toBe(200);
    expect(body).toMatchObject({ cur: { gold: 120, fame: 7, version: 5 }, legacy: null });
    expect((body as { instances: { uid: string }[] }).instances.map(i => i.uid)).toEqual(BAG.map(i => i.uid));
  });

  it('state: 저장 상태가 없으면 구 저장의 최신 본문을 준다', async () => {
    expect((await callMe('state', userToken(LEGACY))).body).toEqual({ cur: null, instances: [], records: [], legacy: { v: 4, gold: 77 } });
  });

  it('bounty: 오늘(게임 날짜)의 클리어와 도전권을 준다', async () => {
    const body = (await callMe('bounty', userToken(ME))).body as { clears: { kind: string }[]; tickets: { quest_id: string }[] };
    expect(body.clears).toHaveLength(1);
    expect(body.tickets.map(t => t.quest_id)).toEqual(['q-ticket']);
  });

  it('profile: 닉네임을 준다', async () => {
    expect(await callMe('profile', userToken(ME))).toMatchObject({ body: { nickname: '나' } });
    expect(await callMe('profile', userToken(LEGACY))).toMatchObject({ body: { nickname: null } });
  });

  describe('profile: 개발 도구 판정(devTools)', () => {
    const devTools = async (uid: string) => ((await callMe('profile', userToken(uid))).body as { devTools: boolean }).devTools;

    it('스테이징에서는 관리자 명부에 있는 계정만 참이다', async () => {
      process.env.DEPLOY_ENV = 'preview';
      expect(await devTools(ADMIN)).toBe(true);
      expect(await devTools(MEMBER)).toBe(false);
    });

    it('게스트는 명부에 올라 있어도 거짓이다', async () => {
      process.env.DEPLOY_ENV = 'preview';
      expect(await devTools(LISTED_GUEST)).toBe(false);
      expect(await devTools(LEGACY)).toBe(false);
    });

    it('운영에서는 명부에 있어도 거짓이다', async () => {
      process.env.DEPLOY_ENV = 'production';
      expect(await devTools(ADMIN)).toBe(false);
    });

    it('로컬 명시 값에서는 모두 참이다', async () => {
      process.env.DEPLOY_ENV = 'local';
      expect(await devTools(MEMBER)).toBe(true);
    });

    it('환경 값이 없거나 모르는 값이면 거짓이다', async () => {
      expect(await devTools(ADMIN)).toBe(false);
      process.env.DEPLOY_ENV = 'development';
      expect(await devTools(ADMIN)).toBe(false);
    });
  });

  it('모르는 q는 400이다', async () => {
    expect(await callMe('nope', userToken(ME))).toMatchObject({ status: 400, body: { error: 'bad-query' } });
  });
});
