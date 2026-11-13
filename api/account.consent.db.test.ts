// 계정 정보 조회의 확인 필요 여부와 수락 요청 — 실제 Postgres에서 판, 시행일 경계, 게스트, 중복, 판 변경을 검사한다.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedUser, sessionHeaders, startActionEnv, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv } from './_dbTest/actionHarness.js';

let env: ActionEnv;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});
afterEach(() => {
  process.env.CONSENT_EFFECTIVE_DATE = '2099-12-31';
});

type Handler = (req: never, res: never) => Promise<void>;
interface Out { status: number; body: unknown; headers: Record<string, string> }

async function call(handler: Handler, method: string, token: string | null, body?: unknown): Promise<Out> {
  const out: Out = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method, body, headers: sessionHeaders(token) } as never, res as never);
  return out;
}
const readAccount = async (token: string | null, method = 'GET') => call((await import('./account.js')).default as Handler, method, token);
const accept = async (token: string | null, body?: unknown, method = 'POST') => call((await import('./consents.js')).default as Handler, method, token, body);

const dayOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const member = (name: string) => seedUser(env.client, { email: `${name}@example.test`, nickname: name });
const guest = () => seedUser(env.client, { email: null, nickname: null });
const records = async (uid: string) => (await env.client.query<{ document: string; version: string; age_confirmed: boolean; channel: string; accepted_at: Date }>(
  'select document, version, age_confirmed, channel, accepted_at from public.consent_records where user_id = $1 order by version, document', [uid])).rows;

describe('GET /api/account', () => {
  it('세션이 없으면 401이고 허용하지 않는 메서드는 405다', async () => {
    expect(await readAccount(null)).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
    const uid = await member('read-guard');
    expect(await readAccount(userToken(uid), 'PUT')).toMatchObject({ status: 405 });
  });

  it('현재 판과 시행일을 담고 캐시하지 않는다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = '2099-12-31';
    const res = await readAccount(userToken(await member('read-shape')));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual({ consent: { required: false, version: '2099-12-31', effectiveAt: '2099-12-31T00:00:00.000Z' } });
  });

  it('시행일 전에는 수락 기록이 없어도 확인이 필요하지 않다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(1);
    const res = await readAccount(userToken(await member('before-day')));
    expect(res.body).toMatchObject({ consent: { required: false } });
  });

  it('시행일 당일부터 현재 판의 기록이 없는 계정은 확인이 필요하다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(0);
    const res = await readAccount(userToken(await member('on-day')));
    expect(res.body).toMatchObject({ consent: { required: true, version: dayOffset(0) } });
  });

  it('게스트는 시행일이 지나도 확인이 필요하지 않다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-3);
    const res = await readAccount(userToken(await guest()));
    expect(res.body).toMatchObject({ consent: { required: false, version: dayOffset(-3) } });
  });

  it('수락한 계정은 필요하지 않고, 판이 바뀌어 이전 판만 수락한 계정은 다시 필요하다', async () => {
    const uid = await member('versions');
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-10);
    expect((await accept(userToken(uid), { version: dayOffset(-10), ageConfirmed: true })).status).toBe(200);
    expect((await readAccount(userToken(uid))).body).toMatchObject({ consent: { required: false } });
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-1);
    expect((await readAccount(userToken(uid))).body).toMatchObject({ consent: { required: true, version: dayOffset(-1) } });
  });
});

describe('POST /api/account/consents', () => {
  it('세션이 없으면 401이고 POST 외 메서드는 405다', async () => {
    expect(await accept(null, { version: '2099-12-31', ageConfirmed: true })).toMatchObject({ status: 401 });
    const uid = await member('accept-guard');
    expect(await accept(userToken(uid), undefined, 'GET')).toMatchObject({ status: 405 });
    expect(await accept(userToken(uid), undefined, 'DELETE')).toMatchObject({ status: 405 });
  });

  it('게스트의 수락 요청은 account-only로 거부하고 기록하지 않는다', async () => {
    const uid = await guest();
    expect(await accept(userToken(uid), { version: '2099-12-31', ageConfirmed: true })).toMatchObject({ status: 403, body: { error: 'account-only' } });
    expect(await records(uid)).toEqual([]);
  });

  it('현재 판이 아닌 판은 409로 거부한다(이전 판, 다음 판, 형식 오류)', async () => {
    const uid = await member('mismatch');
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-1);
    for (const version of [dayOffset(-2), dayOffset(0), '2099-12-31']) {
      expect(await accept(userToken(uid), { version, ageConfirmed: true }), version)
        .toMatchObject({ status: 409, body: { error: 'consent-version-mismatch' } });
    }
    expect(await records(uid)).toEqual([]);
  });

  it('본문이 맞지 않으면 400이다(판 누락·형식, 만 14세 확인 누락·거짓)', async () => {
    const uid = await member('bad-body');
    const version = '2099-12-31';
    for (const bad of [undefined, null, 'x', {}, { version }, { version, ageConfirmed: false }, { version, ageConfirmed: 'true' }, { ageConfirmed: true }, { version: 20991231, ageConfirmed: true }]) {
      expect(await accept(userToken(uid), bad), JSON.stringify(bad)).toMatchObject({ status: 400, body: { error: 'bad-request' } });
    }
    expect(await records(uid)).toEqual([]);
  });

  it('현재 판의 약관과 처리방침 수락을 확인 화면 경로와 만 14세 확인으로 기록하고 새 상태를 돌려준다', async () => {
    const uid = await member('accepts');
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-2);
    const res = await accept(userToken(uid), { version: dayOffset(-2), ageConfirmed: true });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual({ consent: { required: false, version: dayOffset(-2), effectiveAt: `${dayOffset(-2)}T00:00:00.000Z` } });
    expect((await records(uid)).map(r => [r.document, r.version, r.age_confirmed, r.channel])).toEqual([
      ['privacy', dayOffset(-2), true, 'confirm-screen'],
      ['terms', dayOffset(-2), true, 'confirm-screen'],
    ]);
  });

  it('같은 판을 두 번 요청해도 성공하고 기록은 처음 그대로 둘이다', async () => {
    const uid = await member('twice');
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-2);
    const first = await accept(userToken(uid), { version: dayOffset(-2), ageConfirmed: true });
    const recorded = await records(uid);
    const again = await accept(userToken(uid), { version: dayOffset(-2), ageConfirmed: true });
    expect(again).toMatchObject({ status: 200, body: first.body });
    expect(await records(uid)).toEqual(recorded);
  });

  it('시행일 전에도 현재 판을 미리 수락할 수 있다', async () => {
    const uid = await member('early');
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(5);
    expect((await accept(userToken(uid), { version: dayOffset(5), ageConfirmed: true })).status).toBe(200);
    expect(await records(uid)).toHaveLength(2);
  });

  it('판이 바뀐 뒤에는 새 판을 따로 수락하고 이전 판 기록은 남는다', async () => {
    const uid = await member('new-version');
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-5);
    await accept(userToken(uid), { version: dayOffset(-5), ageConfirmed: true });
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-1);
    expect((await accept(userToken(uid), { version: dayOffset(-1), ageConfirmed: true })).status).toBe(200);
    expect((await records(uid)).map(r => `${r.version}/${r.document}`)).toEqual([
      `${dayOffset(-5)}/privacy`, `${dayOffset(-5)}/terms`, `${dayOffset(-1)}/privacy`, `${dayOffset(-1)}/terms`,
    ]);
  });

  it('탈퇴하면 수락 기록도 사라진다', async () => {
    const uid = await member('leaves');
    await accept(userToken(uid), { version: '2099-12-31', ageConfirmed: true });
    expect(await records(uid)).toHaveLength(2);
    const { default: account } = await import('./account.js');
    expect(await call(account as Handler, 'POST', userToken(uid), { op: 'delete' })).toMatchObject({ status: 200 });
    expect(await records(uid)).toEqual([]);
  });
});
