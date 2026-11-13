// 확인이 필요한 계정의 게임 요청 거부 — 실제 Postgres에서 시행일 경계, 게스트, 허용 경로, 판 변경, 탈퇴를 검사한다.
import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedUser, sessionHeaders, startActionEnv, userToken } from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';
import { recordConsent } from '../_data/consent.js';
import { consentGate, liveConsentAdmit } from './consentGate.js';
import { database } from '../_db/client.js';

let env: ActionEnv;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});
afterEach(() => {
  vi.useRealTimers();
  process.env.CONSENT_EFFECTIVE_DATE = '2099-12-31';
});

const dayOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const member = (name: string) => seedUser(env.client, { email: `${name}@example.test`, nickname: name });
const guest = () => seedUser(env.client, { email: null, nickname: null });

interface Verdict { passed: boolean; status: number; body: unknown }

/** 미들웨어를 한 번 거치게 하고 다음 처리로 넘어갔는지, 아니면 어떤 응답으로 막혔는지를 돌려준다 */
async function through(path: string, token: string | null, method = 'POST'): Promise<Verdict> {
  const out: Verdict = { passed: false, status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
  };
  await new Promise<void>(resolve => {
    const done = () => resolve();
    const original = res.json;
    res.json = (b: unknown) => { original(b); done(); };
    consentGate()({ method, baseUrl: '/api', path, headers: sessionHeaders(token) } as never, res as never, () => { out.passed = true; done(); });
  });
  return out;
}

const REJECTED = { passed: false, status: 403, body: { error: 'consent-required' } };
const PASSED = { passed: true, status: 0, body: undefined };

describe('consentGate', () => {
  it('시행일 전에는 수락 기록이 없는 계정도 막지 않는다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(1);
    expect(await through('/action', userToken(await member('before-day')))).toEqual(PASSED);
  });

  it('시행일 당일부터 수락 기록이 없는 계정의 게임 요청을 consent-required로 거부한다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(0);
    const token = userToken(await member('on-day'));
    for (const path of ['/action', '/me', '/me/position', '/mail', '/friends', '/friends/x', '/players', '/rank', '/blocks',
      '/chat/messages/1/reports', '/away-report', '/guilds', '/guilds/me', '/guild-memberships']) {
      expect(await through(path, token), path).toEqual(REJECTED);
    }
  });

  it('계정 정보 조회, 수락 요청, 탈퇴와 인증, 관리자 대시보드, 예약 작업, 초대 미리보기는 거부하지 않는다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(0);
    const token = userToken(await member('exempt'));
    for (const path of ['/account', '/account/consents', '/auth/sign-out', '/admin', '/admin/live', '/admin/auth/sign-out',
      '/cron/archive', '/cron/purge-anon', '/guild-invites/ABCD1234']) {
      expect(await through(path, token), path).toEqual(PASSED);
    }
  });

  it('현재 판을 수락한 계정은 막지 않는다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-2);
    const uid = await member('accepted');
    await recordConsent(database().db, uid, dayOffset(-2), 'confirm-screen');
    expect(await through('/action', userToken(uid))).toEqual(PASSED);
  });

  it('판이 바뀐 뒤 이전 판만 수락한 계정은 다시 막는다', async () => {
    const uid = await member('old-version');
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-5);
    await recordConsent(database().db, uid, dayOffset(-5), 'google-link');
    expect(await through('/action', userToken(uid))).toEqual(PASSED);
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-1);
    expect(await through('/action', userToken(uid))).toEqual(REJECTED);
  });

  it('수락하면 같은 세션의 다음 요청부터 열린다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(0);
    const uid = await member('then-accepts');
    const token = userToken(uid);
    expect(await through('/action', token)).toEqual(REJECTED);
    await recordConsent(database().db, uid, dayOffset(0), 'confirm-screen');
    expect(await through('/action', token)).toEqual(PASSED);
  });

  it('게스트는 시행일이 지나도 막지 않는다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(-3);
    expect(await through('/action', userToken(await guest()))).toEqual(PASSED);
  });

  it('관리자 계정도 같은 규칙으로 막는다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(0);
    const uid = await member('admin-user');
    await env.client.query('insert into public.admins (user_id) values ($1)', [uid]);
    expect(await through('/action', userToken(uid))).toEqual(REJECTED);
  });

  it('세션이 없거나 탈퇴한 계정의 요청은 거부하지 않고 각 핸들러의 401에 맡긴다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(0);
    expect(await through('/action', null)).toEqual(PASSED);
    expect(await through('/action', 'test-session-00000000-0000-4000-8000-0000000000ff')).toEqual(PASSED);
  });

  it('시행일 설정이 올바르지 않으면 500으로 알린다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = 'soon';
    expect(await through('/action', userToken(await member('bad-config')))).toEqual({ passed: false, status: 500, body: { error: 'server-config' } });
  });
});

describe('liveConsentAdmit', () => {
  it('확인이 필요한 계정의 실시간 접속을 막고 그 밖은 받는다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(0);
    const need = await member('live-need');
    const done = await member('live-done');
    await recordConsent(database().db, done, dayOffset(0), 'confirm-screen');
    expect(await liveConsentAdmit({ uid: need, guest: false })).toBe(false);
    expect(await liveConsentAdmit({ uid: done, guest: false })).toBe(true);
    expect(await liveConsentAdmit({ uid: need, guest: true })).toBe(true);
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(1);
    expect(await liveConsentAdmit({ uid: need, guest: false })).toBe(true);
  });
});

describe('Express에 붙였을 때', () => {
  it('실제 경로 처리에서 /api 아래 경로를 구분해 막거나 통과시킨다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = dayOffset(0);
    const app = express();
    app.use('/api', express.json());
    app.use('/api', consentGate());
    app.all('/api/*splat', (req, res) => { res.status(200).json({ reached: req.path }); });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', () => resolve()));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const get = async (path: string, token: string | null) => {
        const r = await fetch(`${base}${path}`, { headers: sessionHeaders(token) });
        return { status: r.status, body: await r.json() as unknown };
      };
      const token = userToken(await member('wired'));
      expect(await get('/api/action', token)).toEqual({ status: 403, body: { error: 'consent-required' } });
      expect(await get('/api/guilds/me', token)).toEqual({ status: 403, body: { error: 'consent-required' } });
      expect(await get('/api/account', token)).toEqual({ status: 200, body: { reached: '/api/account' } });
      expect(await get('/api/account/consents', token)).toEqual({ status: 200, body: { reached: '/api/account/consents' } });
      expect(await get('/api/action', null)).toEqual({ status: 200, body: { reached: '/api/action' } });
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});

describe('시행 시각을 넘기는 시계', () => {
  it('시행 전에 열린 연결의 계정은 시행 시각이 지나면 다시 판정에서 걸리고, 수락하면 풀린다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = '2031-05-02';
    const uid = await member('clock-crossing');
    vi.useFakeTimers({ now: new Date('2031-05-01T12:00:00.000Z'), toFake: ['Date'] });
    expect(await liveConsentAdmit({ uid, guest: false })).toBe(true);
    vi.setSystemTime(new Date('2031-05-01T23:59:59.999Z'));
    expect(await liveConsentAdmit({ uid, guest: false })).toBe(true);
    vi.setSystemTime(new Date('2031-05-02T00:00:00.000Z'));
    expect(await liveConsentAdmit({ uid, guest: false })).toBe(false);
    await recordConsent(database().db, uid, '2031-05-02', 'confirm-screen');
    expect(await liveConsentAdmit({ uid, guest: false })).toBe(true);
  });

  it('게스트는 시행 시각이 지난 뒤에도 거부 게이트와 실시간 판정을 통과한다', async () => {
    process.env.CONSENT_EFFECTIVE_DATE = '2031-05-02';
    const uid = await guest();
    vi.useFakeTimers({ now: new Date('2031-06-01T00:00:00.000Z'), toFake: ['Date'] });
    expect(await through('/action', userToken(uid))).toEqual(PASSED);
    expect(await liveConsentAdmit({ uid, guest: true })).toBe(true);
  });
});
