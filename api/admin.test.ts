// 관리자 핸들러 단위 테스트 — DB/컨테이너 없이 사문화 ?q= 제거, userState 검증, 우편 안전장치(409 duplicate-mail·멱등·상한)를 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_UID = '00000000-0000-4000-8000-000000000901';
const TARGET_UID = '00000000-0000-4000-8000-000000000902';

const mocks = vi.hoisted(() => ({
  adminSessionUid: vi.fn(async () => ADMIN_UID),
  isAdmin: vi.fn(async () => true),
  userState: vi.fn(async () => ({ hasSave: true })),
  economy: vi.fn(async () => []),
  planMail: vi.fn(),
  deliverMail: vi.fn(),
  db: { execute: vi.fn() },
  withTransaction: vi.fn(),
}));

vi.mock('./_auth/session.js', () => ({
  adminSessionUid: mocks.adminSessionUid,
}));
vi.mock('./_db/client.js', () => ({
  database: () => ({ db: mocks.db, withTransaction: mocks.withTransaction }),
}));
vi.mock('./_data/admin.js', async () => {
  const actual = await vi.importActual<typeof import('./_data/admin.js')>('./_data/admin.js');
  return {
    ...actual,
    isAdmin: mocks.isAdmin,
    userState: mocks.userState,
    economy: mocks.economy,
  };
});

import handler from './admin.js';
import { clearMailIdempotencyCache, MAX_MAIL_BATCH_TOTAL_GOLD } from './_data/mailbox.js';

async function call(method: string, query: Record<string, string>, body?: unknown) {
  const out = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; },
  };
  await handler({ method, query, body, headers: {} } as never, res as never);
  return out;
}

describe('api/admin 핸들러 단위 테스트', () => {
  const prevDbUrl = process.env.DATABASE_URL;
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://unit-test';
    vi.clearAllMocks();
    mocks.adminSessionUid.mockResolvedValue(ADMIN_UID);
    mocks.isAdmin.mockResolvedValue(true);
  });
  afterEach(() => {
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
  });

  it('제거된 사문화 ?q=dailyActive·catchQuality·retention은 400 bad-query를 돌려준다', async () => {
    for (const q of ['dailyActive', 'catchQuality', 'retention']) {
      expect(await call('GET', { q, days: '7' })).toMatchObject({
        status: 400,
        body: { error: 'bad-query' },
      });
    }
  });

  it('GET ?q=userState는 uid UUID를 검증하고 userState 읽기를 호출한다', async () => {
    expect(await call('GET', { q: 'userState' })).toMatchObject({ status: 400, body: { error: 'bad-user' } });
    expect(await call('GET', { q: 'userState', uid: 'not-a-uuid' })).toMatchObject({ status: 400, body: { error: 'bad-user' } });

    const sampleState = { hasSave: true, dex: { normal: 10, normalTotal: 120 } };
    mocks.userState.mockResolvedValueOnce(sampleState);
    const res = await call('GET', { q: 'userState', uid: TARGET_UID });
    expect(res).toMatchObject({ status: 200, body: sampleState });
    expect(mocks.userState).toHaveBeenCalledWith(mocks.db, TARGET_UID);
  });

  it('POST ?q=mail은 중복 수신자·상한 초과·멱등 재전송·최근 중복 발송(409 duplicate-mail)을 차단한다', async () => {
    clearMailIdempotencyCache();

    // 중복 수신자 차단
    const dupRes = await call('POST', { q: 'mail' }, {
      op: 'preview',
      request: {
        title: '안내', body: '본문',
        target: { kind: 'users', recipients: [{ userId: TARGET_UID, gold: 10 }, { userId: TARGET_UID.toUpperCase(), gold: 20 }] },
      },
    });
    expect(dupRes).toMatchObject({ status: 200, body: { problems: ['duplicate'], duplicates: [TARGET_UID], preview: null } });

    // 상한 초과 미리보기
    mocks.db.execute.mockResolvedValueOnce({ rows: [{ id: TARGET_UID }] });
    const capRes = await call('POST', { q: 'mail' }, {
      op: 'preview',
      request: {
        title: '안내', body: '본문',
        target: { kind: 'users', recipients: [{ userId: TARGET_UID, gold: MAX_MAIL_BATCH_TOTAL_GOLD + 1 }] },
      },
    });
    expect(capRes).toMatchObject({
      status: 200,
      body: {
        problems: ['totalGold'],
        preview: { recipientCount: 1, capExceeded: true, maxTotalGold: MAX_MAIL_BATCH_TOTAL_GOLD },
      },
    });

    // 멱등 키 1회 성공 후 재전송 차단
    const key = '11111111-1111-4111-8111-111111111111';
    const mailReq = {
      title: '안내', body: '본문',
      target: { kind: 'users', recipients: [{ userId: TARGET_UID, gold: 100 }] },
    };
    mocks.db.execute
      .mockResolvedValueOnce({ rows: [{ id: TARGET_UID }] }) // previewMails
      .mockResolvedValueOnce({ rows: [{ found: false }] })   // hasRecentDuplicateMail
      .mockResolvedValueOnce({ rows: [{ n: 1 }] });          // sendMails
    const first = await call('POST', { q: 'mail' }, { op: 'send', request: mailReq, idempotencyKey: key });
    expect(first).toMatchObject({ status: 200, body: { sent: 1, problems: [] } });

    const replay = await call('POST', { q: 'mail' }, { op: 'send', request: mailReq, idempotencyKey: key });
    expect(replay).toMatchObject({ status: 200, body: { sent: 0, idempotent: true } });

    // 다른 키로 10분 내 동일 우편 재시도 시 DB 중복 창이 409 duplicate-mail로 차단
    mocks.db.execute
      .mockResolvedValueOnce({ rows: [{ id: TARGET_UID }] })
      .mockResolvedValueOnce({ rows: [{ found: true }] });
    const dupWindow = await call('POST', { q: 'mail' }, {
      op: 'send',
      request: { ...mailReq, idempotencyKey: '22222222-2222-4222-8222-222222222222' },
    });
    expect(dupWindow).toMatchObject({ status: 409, body: { error: 'duplicate-mail' } });
  });
});
