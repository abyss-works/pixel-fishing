import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { legalPages } from './legalPages.js';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(legalPages(publicDir));
  app.use((_req, res) => { res.status(404).end(); });
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>(resolve => { server.close(() => resolve()); }));

describe('공개 문서 제공', () => {
  it.each(['/about', '/terms', '/privacy'])('%s는 로그인 쿠키 없이 HTML로 나간다', async (path) => {
    const res = await fetch(base + path);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(res.headers.has('set-cookie')).toBe(false);
    expect(await res.text()).toContain('<html lang="ko">');
  });

  it('문서마다 제 파일을 낸다', async () => {
    expect(await (await fetch(`${base}/terms`)).text()).toContain('이용약관');
    expect(await (await fetch(`${base}/privacy`)).text()).toContain('개인정보 처리방침');
  });

  it('캐시는 짧게 둔다. 장기 불변 캐시를 쓰지 않는다', async () => {
    const res = await fetch(`${base}/terms`);
    const control = res.headers.get('cache-control') ?? '';
    expect(control).not.toContain('immutable');
    const maxAge = Number(/max-age=(\d+)/.exec(control)?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(3600);
  });

  it('목록에 없는 주소는 넘긴다', async () => {
    expect((await fetch(`${base}/policy`)).status).toBe(404);
  });

  it('HEAD 요청도 같은 머리를 낸다', async () => {
    const res = await fetch(`${base}/privacy`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
  });
});
