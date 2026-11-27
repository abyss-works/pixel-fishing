// @vitest-environment node
// 프리렌더·프리페치 요청 판정 및 차단 미들웨어 단위·통합 테스트.
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { PRERENDER_BLOCKED_PATHS, blockPrerender, isPrerenderRequest } from './prerender.js';

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function startApp() {
  const app = express();
  app.use([...PRERENDER_BLOCKED_PATHS], blockPrerender());
  app.all('/api/auth/*splat', (_req, res) => { res.status(200).json({ ok: true }); });
  app.get('/api/action', (_req, res) => { res.status(204).end(); });
  app.post('/api/action', (_req, res) => { res.status(200).json({ ok: true }); });
  app.post('/api/client-metrics', (_req, res) => { res.status(204).end(); });

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  cleanup = async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe('isPrerenderRequest', () => {
  it('Sec-Purpose 또는 Purpose 헤더에 prerender·prefetch 토큰이 있으면 true를 돌려준다', () => {
    expect(isPrerenderRequest({ 'sec-purpose': 'prefetch;prerender' })).toBe(true);
    expect(isPrerenderRequest({ 'sec-purpose': 'prerender' })).toBe(true);
    expect(isPrerenderRequest({ 'sec-purpose': 'prefetch' })).toBe(true);
    expect(isPrerenderRequest({ 'sec-purpose': 'PreRender, Prefetch' })).toBe(true);
    expect(isPrerenderRequest({ purpose: 'prefetch' })).toBe(true);
    expect(isPrerenderRequest({ purpose: 'prerender; anonymous-client-ip' })).toBe(true);
    expect(isPrerenderRequest({ 'sec-purpose': ['none', 'prefetch; prerender'] })).toBe(true);
  });

  it('일반 요청이나 부분 일치 토큰은 false를 돌려준다', () => {
    expect(isPrerenderRequest({})).toBe(false);
    expect(isPrerenderRequest({ 'sec-purpose': '' })).toBe(false);
    expect(isPrerenderRequest({ 'sec-purpose': 'navigate' })).toBe(false);
    expect(isPrerenderRequest({ 'sec-purpose': 'prerender-test' })).toBe(false);
    expect(isPrerenderRequest({ purpose: 'prefetch-other' })).toBe(false);
  });
});

describe('blockPrerender 미들웨어', () => {
  it('POST /api/auth/* 와 POST /api/action 의 프리렌더·프리페치 요청을 403 prerender-blocked로 거부한다', async () => {
    const base = await startApp();

    const authRes = await fetch(`${base}/api/auth/sign-in/anonymous`, {
      method: 'POST',
      headers: { 'Sec-Purpose': 'prefetch;prerender' },
    });
    expect(authRes.status).toBe(403);
    expect(await authRes.json()).toEqual({ error: 'prerender-blocked' });

    const actionRes = await fetch(`${base}/api/action`, {
      method: 'POST',
      headers: { Purpose: 'prefetch' },
    });
    expect(actionRes.status).toBe(403);
    expect(await actionRes.json()).toEqual({ error: 'prerender-blocked' });
  });

  it('대소문자가 섞인 /API/AUTH/* 와 /Api/Action POST 프리렌더·프리페치 요청도 403으로 차단한다', async () => {
    const base = await startApp();

    const upperAuthRes = await fetch(`${base}/API/AUTH/sign-in/anonymous`, {
      method: 'POST',
      headers: { 'Sec-Purpose': 'prefetch;prerender' },
    });
    expect(upperAuthRes.status).toBe(403);
    expect(await upperAuthRes.json()).toEqual({ error: 'prerender-blocked' });

    const mixedActionRes = await fetch(`${base}/Api/Action`, {
      method: 'POST',
      headers: { Purpose: 'prerender' },
    });
    expect(mixedActionRes.status).toBe(403);
    expect(await mixedActionRes.json()).toEqual({ error: 'prerender-blocked' });
  });

  it('GET 요청과 일반 POST 요청, 다른 API 경로는 통과시킨다', async () => {
    const base = await startApp();

    const getAction = await fetch(`${base}/api/action`, {
      method: 'GET',
      headers: { 'Sec-Purpose': 'prefetch;prerender' },
    });
    expect(getAction.status).toBe(204);

    const getAuth = await fetch(`${base}/api/auth/get-session`, {
      method: 'GET',
      headers: { 'Sec-Purpose': 'prerender' },
    });
    expect(getAuth.status).toBe(200);

    const normalAuth = await fetch(`${base}/api/auth/sign-in/anonymous`, {
      method: 'POST',
    });
    expect(normalAuth.status).toBe(200);

    const normalAction = await fetch(`${base}/api/action`, {
      method: 'POST',
    });
    expect(normalAction.status).toBe(200);

    const otherApi = await fetch(`${base}/api/client-metrics`, {
      method: 'POST',
      headers: { 'Sec-Purpose': 'prefetch;prerender' },
    });
    expect(otherApi.status).toBe(204);
  });
});
