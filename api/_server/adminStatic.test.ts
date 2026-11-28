import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createAdminStaticRouter } from './adminStatic.js';
import { notFound } from './notFound.js';

let tempRoot = '';
let server: Server | null = null;

beforeAll(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'admin-static-test-'));
  const adminDir = join(tempRoot, 'admin');
  const assetsDir = join(adminDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  writeFileSync(join(adminDir, 'index.html'), '<!doctype html><html><body>admin-spa</body></html>');
  writeFileSync(join(assetsDir, 'app.js'), 'console.log("admin");');
});

afterAll(() => {
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

afterEach(async () => {
  if (!server) return;
  const target = server;
  server = null;
  await new Promise<void>(resolve => {
    target.close(() => resolve());
  });
});

async function startTestApp(): Promise<string> {
  const app = express();
  app.use(createAdminStaticRouter(tempRoot));
  app.use(notFound);
  server = app.listen(0);
  await new Promise<void>(resolve => server!.once('listening', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('createAdminStaticRouter', () => {
  it('GET /admin 은 301 Location: /admin/ 으로 리다이렉트한다', async () => {
    const base = await startTestApp();
    const res = await fetch(`${base}/admin`, { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/admin/');
  });

  it('GET /admin/ 은 리다이렉트 루프 없이 200 index.html 을 서빙한다', async () => {
    const base = await startTestApp();
    const res = await fetch(`${base}/admin/`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('admin-spa');
  });

  it('GET /admin/users (SPA 하위 경로)는 200 index.html 을 서빙한다', async () => {
    const base = await startTestApp();
    const res = await fetch(`${base}/admin/users`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('admin-spa');
  });

  it('GET /admin/assets/app.js 는 immutable 캐시 헤더로 200 을 서빙하고 없는 에셋은 404 를 반환한다', async () => {
    const base = await startTestApp();
    const hit = await fetch(`${base}/admin/assets/app.js`);
    expect(hit.status).toBe(200);
    expect(hit.headers.get('cache-control')).toContain('immutable');

    const miss = await fetch(`${base}/admin/assets/missing.js`);
    expect(miss.status).toBe(404);
  });
});
