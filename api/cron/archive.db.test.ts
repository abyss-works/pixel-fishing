// 콜드 아카이브 크론 특성 테스트 — 실제 Postgres에서 옮길 행 선정, 업로드 내용, 삭제 결과를 고정한다.
// R2는 메모리 저장소 대역으로 받는다. 스냅샷은 데이터 계층 전환 전 구현으로 기록했다.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { captureRealClock, normalize, seedUser, startActionEnv, testUid } from '../_dbTest/actionHarness.js';
import type { ActionEnv } from '../_dbTest/actionHarness.js';

const NOW = '2030-03-04T05:06:07.000Z';
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.parse(NOW) - days * DAY).toISOString();

let env: ActionEnv;
let tmp: string;
const objects = new Map<string, Buffer>();

beforeAll(async () => {
  env = await startActionEnv();
  tmp = mkdtempSync(join(tmpdir(), 'pf-archive-'));
  Object.assign(process.env, {
    CRON_SECRET: 'test-cron-secret', R2_ACCOUNT_ID: 'acct', R2_BUCKET: 'bucket',
    R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_PREFIX: 'test/cold',
    ARCHIVE_CUTOFF_DAYS: '7', ARCHIVE_TMP_DIR: tmp,
  });
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.host.endsWith('.r2.cloudflarestorage.com')) {
      const key = decodeURIComponent(url.pathname.replace(/^\/bucket\//, ''));
      const method = init?.method ?? 'GET';
      if (method === 'PUT') {
        objects.set(key, Buffer.from(init?.body as Uint8Array));
        return new Response(null, { status: 200 });
      }
      const body = objects.get(key);
      if (!body) return new Response(null, { status: 404 });
      return method === 'HEAD'
        ? new Response(null, { status: 200, headers: { 'content-length': String(body.length) } })
        : new Response(body, { status: 200 });
    }
    return realFetch(url, init);
  });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  rmSync(tmp, { recursive: true, force: true });
  await env?.stop();
});

async function callCron(authorization: string | null, method = 'GET') {
  const { default: handler } = await import('./archive.js');
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
  };
  await handler({ method, headers: authorization ? { authorization } : {} } as never, res as never);
  return out;
}

/** 업로드된 객체를 내용 기준으로 읽는다. gzip은 풀어 JSONL 행으로, 매니페스트는 JSON으로 */
function uploaded(uid: string) {
  return [...objects.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, body]) => ({
    key,
    content: key.endsWith('.json')
      ? normalize({ ...JSON.parse(body.toString()), sha256: '<sha256>', bytesGzip: '<bytes>' }, uid)
      : gunzipSync(body).toString().trim().split('\n').map(line => {
        const { id: _id, ...row } = JSON.parse(line) as Record<string, unknown>;
        return normalize(row, uid);
      }),
  }));
}

describe('콜드 아카이브 크론', () => {
  it('GET 외 메서드는 405, 비밀값이 다르면 401이다', async () => {
    expect(await callCron(null, 'POST')).toMatchObject({ status: 405 });
    expect(await callCron('Bearer wrong')).toMatchObject({ status: 401 });
  });

  it('컷오프 이전 events와 사용자별 최신 1행을 넘는 오래된 saves만 옮기고 지운다', async () => {
    captureRealClock(() => performance.timeOrigin + performance.now());
    const a = await seedUser(env.client, { uid: testUid(1) });
    const b = await seedUser(env.client, { uid: testUid(2) });
    for (const [user, type, at] of [[a, 'catch', ago(10)], [a, 'sell', ago(8)], [b, 'boot', ago(9)], [a, 'boot', ago(1)]] as const) {
      await env.client.query('insert into public.events (user_id, type, payload, created_at) values ($1, $2, $3, $4)',
        [user, type, { at }, at]);
    }
    for (const [user, gold, at] of [[a, 1, ago(30)], [a, 2, ago(20)], [a, 3, ago(10)], [b, 4, ago(9)], [b, 5, ago(2)]] as const) {
      await env.client.query('insert into public.saves (user_id, data, updated_at) values ($1, $2, $3)', [user, { gold }, at]);
    }

    vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
    try {
      const res = await callCron('Bearer test-cron-secret');
      const left = {
        events: (await env.client.query('select user_id, type, created_at from public.events order by created_at')).rows,
        saves: (await env.client.query('select user_id, data, updated_at from public.saves order by updated_at')).rows,
      };
      expect({ res: normalize(res, a), left: normalize(left, a), uploaded: uploaded(a) }).toMatchSnapshot();
    } finally {
      vi.useRealTimers();
    }
  });
});
