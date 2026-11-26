import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notFound } from './notFound.js';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

let server: Server;
let base: string;

beforeAll(async () => {
  // 서버 진입점과 같은 순서로 정적 파일 제공 뒤에 404 응답을 둔다
  const app = express();
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
    const res = await fetch(`${base}/api/없는경로`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({ error: 'not-found' });
  });

  it('그 밖의 경로는 Cannot GET 없이 정돈된 404 HTML을 낸다', async () => {
    const res = await fetch(`${base}/없는경로`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(await res.text()).not.toContain('Cannot GET');
  });
});
