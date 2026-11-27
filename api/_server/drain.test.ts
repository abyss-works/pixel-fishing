import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createDrainGuard } from './drain.js';

let server: Server | null = null;

async function startTestApp() {
  const drain = createDrainGuard();
  const app = express();
  app.use(drain.middleware);
  app.get('/api/action', (_req, res) => { res.status(204).end(); });
  app.post('/api/action', (_req, res) => { res.json({ ok: true }); });
  app.get('/api/me', (_req, res) => { res.json({ ok: true }); });
  app.get('/', (_req, res) => { res.type('html').send('<h1>ok</h1>'); });

  server = app.listen(0);
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { drain, base };
}

afterEach(async () => {
  if (!server) return;
  const target = server;
  server = null;
  await new Promise<void>(resolve => { target.close(() => resolve()); });
});

describe('createDrainGuard', () => {
  it('드레인 시작 전에는 GET/HEAD /api/action이 통과한다', async () => {
    const { drain, base } = await startTestApp();
    expect(drain.isDraining()).toBe(false);

    const getRes = await fetch(`${base}/api/action`, { method: 'GET' });
    expect(getRes.status).toBe(204);

    const headRes = await fetch(`${base}/api/action`, { method: 'HEAD' });
    expect(headRes.status).toBe(204);
  });

  it('drain.start() 후 GET/HEAD /api/action은 503 server-draining을 반환한다', async () => {
    const { drain, base } = await startTestApp();
    drain.start();
    expect(drain.isDraining()).toBe(true);

    const getRes = await fetch(`${base}/api/action`, { method: 'GET' });
    expect(getRes.status).toBe(503);
    expect(await getRes.json()).toEqual({ error: 'server-draining' });

    const headRes = await fetch(`${base}/api/action`, { method: 'HEAD' });
    expect(headRes.status).toBe(503);
  });

  it('드레인 중에도 POST /api/action과 다른 경로는 차단하지 않는다', async () => {
    const { drain, base } = await startTestApp();
    drain.start();

    const postRes = await fetch(`${base}/api/action`, { method: 'POST' });
    expect(postRes.status).toBe(200);
    expect(await postRes.json()).toEqual({ ok: true });

    const meRes = await fetch(`${base}/api/me`, { method: 'GET' });
    expect(meRes.status).toBe(200);

    const rootRes = await fetch(`${base}/`, { method: 'GET' });
    expect(rootRes.status).toBe(200);
  });
});
