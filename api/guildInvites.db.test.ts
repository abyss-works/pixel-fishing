// 길드 초대 링크 — 실제 Postgres에서 로그인 없는 미리보기 API, 초대 링크 HTML의 미리보기 태그, 요청 수 제한을 검사한다.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedUser, startActionEnv, testUid } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';
import { database } from './_db/client.js';
import { createGuild } from './_data/guilds.js';
import { guildInviteRoutes, inviteMetaText } from './guildInvites.js';

let env: ActionEnv;
const LEADER = testUid(981);
const CODE = 'K7QX2MAB';
const HTML = '<head><!-- og:start --><meta property="og:title" content="픽셀 낚시" /><!-- og:end --></head>';

beforeAll(async () => {
  env = await startActionEnv();
  await seedUser(env.client, { uid: LEADER, email: 'inv@test.dev', nickname: '초대장', state: {} });
  const r = await createGuild(database().withTransaction, LEADER, '새벽선단', CODE, new Date().toISOString());
  if (!r.ok) throw new Error(r.error);
});
afterAll(async () => {
  await env?.stop();
});

async function call(handler: (req: never, res: never) => Promise<void>, code: string, ip = '1.1.1.1', method = 'GET') {
  const out: { status: number; body: unknown; headers: Record<string, string> } = { status: 0, body: undefined, headers: {} };
  const res = {
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; },
    send(b: string) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method, params: { code }, headers: { 'x-forwarded-for': ip }, socket: {} } as never, res as never);
  return out;
}

describe('길드 초대 링크', () => {
  it('미리보기 API는 로그인 없이 길드 요약을 주고, 형식이 틀리거나 없는 코드는 404다', async () => {
    const { api } = guildInviteRoutes('https://pf.test', async () => HTML);
    expect(await call(api, CODE.toLowerCase())).toMatchObject({
      status: 200, body: { invite: { code: CODE, name: '새벽선단', level: 1, members: 1, cap: 10, joinMode: 'approval' } } });
    expect(await call(api, 'nope')).toMatchObject({ status: 404, body: { error: 'bad-code' } });
    expect(await call(api, 'ZZZZ2222')).toMatchObject({ status: 404, body: { error: 'bad-code' } });
    expect(await call(api, CODE, '1.1.1.1', 'POST')).toMatchObject({ status: 405 });
  });

  it('초대 링크 HTML은 길드 미리보기 태그를 절대 주소로 끼우고, 없는 코드면 기본 HTML을 낸다', async () => {
    const { page } = guildInviteRoutes('https://pf.test', async () => HTML);
    const ok = await call(page, CODE);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('text/html');
    expect(ok.body).toContain('content="새벽선단 길드 초대"');
    expect(ok.body).toContain('content="https://pf.test/g/K7QX2MAB"');
    expect(ok.body).toContain('content="https://pf.test/og.png"');
    expect(await call(page, 'ZZZZ2222')).toMatchObject({ status: 200, body: HTML });
  });

  it('미리보기 글자는 이름, 레벨, 인원이다', () => {
    expect(inviteMetaText({ code: CODE, name: '새벽선단', level: 3, members: 6, cap: 10, joinMode: 'open' }))
      .toEqual({ title: '새벽선단 길드 초대', description: '픽셀 낚시 길드 Lv.3, 길드원 6/10명' });
  });

  it('접속 주소 하나가 1분에 30번을 넘게 열면 API는 429, 링크 HTML은 미리보기 없이 기본 HTML을 낸다', async () => {
    const { api, page } = guildInviteRoutes('https://pf.test', async () => HTML);
    for (let i = 0; i < 30; i++) await call(api, 'ZZZZ2222', '9.9.9.9');
    expect(await call(api, CODE, '9.9.9.9')).toMatchObject({ status: 429, body: { error: 'rate-limited' } });
    expect(await call(page, CODE, '9.9.9.9')).toMatchObject({ status: 200, body: HTML });
    expect(await call(api, CODE, '8.8.8.8')).toMatchObject({ status: 200 });
  });
});
