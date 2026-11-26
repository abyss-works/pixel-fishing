import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { legalPages } from './legalPages.js';
import { notFound } from './notFound.js';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

let server: Server;
let base: string;

beforeAll(async () => {
  // 서버 진입점(main.ts)과 같은 순서: /api 라우터 뒤 /api 404, 첫 화면·문서·정적 파일 뒤 전역 404
  const app = express();
  app.get('/api/ping', (_req, res) => { res.json({ ok: true }); });
  app.use('/api', notFound);
  app.get(['/', '/index.html'], (_req, res) => { res.type('html').send('<h1>index</h1>'); });
  app.use(legalPages());
  app.use(express.static(publicDir));
  app.use(notFound);
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); });
});

describe('검색 진입 파일', () => {
  it('robots.txt는 텍스트로 열리고 비공개 경로를 막는다', async () => {
    const res = await fetch(`${base}/robots.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    const body = await res.text();
    expect(body).toContain('Disallow: /api');
    expect(body).toContain('Disallow: /g/');
    expect(body).toContain('Sitemap: https://pixel-fishing.abyssworks.dev/sitemap.xml');
  });

  it('sitemap.xml은 XML로 열리고 공개 경로만 담는다', async () => {
    const res = await fetch(`${base}/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/xml/);
    const body = await res.text();
    for (const path of ['/', '/about', '/terms', '/privacy', '/policy']) {
      expect(body).toContain(`<loc>https://pixel-fishing.abyssworks.dev${path}</loc>`);
    }
    expect(body).not.toContain('/api');
    expect(body).not.toContain('/g/');
  });
});

describe('등록되지 않은 경로', () => {
  it('/api 아래는 API 오류 형식의 404 JSON을 낸다', async () => {
    for (const path of ['/api/nope', '/api/없는경로', '/api']) {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toMatch(/^application\/json/);
      expect(await res.json()).toEqual({ error: 'not-found' });
    }
  });

  it('그 밖의 경로는 Cannot GET 없이 noindex와 처음 화면 링크가 있는 404 HTML을 낸다', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    const body = await res.text();
    expect(body).toContain('noindex');
    expect(body).toContain('href="/"');
    expect(body).not.toContain('Cannot GET');
  });

  it('등록된 경로는 404로 먹히지 않는다', async () => {
    for (const path of ['/', '/index.html', '/terms', '/robots.txt', '/api/ping']) {
      const res = await fetch(`${base}${path}`, { redirect: 'manual' });
      expect(res.status, path).toBe(200);
    }
  });
});
