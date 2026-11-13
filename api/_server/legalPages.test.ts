import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEGAL_PATHS } from '../../src/features/account/model/googleFlow.js';
import { consentGate } from './consentGate.js';
import { legalPages } from './legalPages.js';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

let server: Server;
let base: string;
const savedDate = process.env.CONSENT_EFFECTIVE_DATE;

beforeAll(async () => {
  // 시행일을 과거로 둬 약관 수락 게이트가 켜진 상태에서 확인한다
  process.env.CONSENT_EFFECTIVE_DATE = '2020-01-01';
  const app = express();
  app.use('/api', consentGate());
  app.use(legalPages(publicDir));
  app.use((_req, res) => { res.status(404).end(); });
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (savedDate === undefined) delete process.env.CONSENT_EFFECTIVE_DATE;
  else process.env.CONSENT_EFFECTIVE_DATE = savedDate;
  await new Promise<void>(resolve => { server.close(() => resolve()); });
});

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

  it.each(['/terms', '/privacy'])('%s의 머리에 서버의 현재 판이 들어가고 토큰이 남지 않는다', async (path) => {
    const html = await (await fetch(base + path)).text();
    expect(html).toContain('<p class="edition">시행일(판): 2020-01-01</p>');
    expect(html).not.toContain('{{');
  });

  it('이용약관 부칙의 시행일도 현재 판이다', async () => {
    expect(await (await fetch(`${base}/terms`)).text()).toContain('<li>이 약관은 2020-01-01부터 시행합니다.</li>');
  });

  it('판이 없는 소개 문서는 그대로 낸다', async () => {
    expect(await (await fetch(`${base}/about`)).text()).not.toContain('2020-01-01');
  });

  it.each(['/about', '/terms', '/privacy'])('시행일이 지난 뒤 수락하지 않은 계정의 세션 쿠키로도 %s가 200이고 쿠키를 만들지 않는다', async (path) => {
    const res = await fetch(base + path, { headers: { cookie: 'better-auth.session_token=unaccepted-account' } });
    expect(res.status).toBe(200);
    expect(res.headers.has('set-cookie')).toBe(false);
  });

  it('목록에 없는 주소는 넘긴다', async () => {
    expect((await fetch(`${base}/policy`)).status).toBe(404);
  });

  it.each(Object.values(LEGAL_PATHS))('게임 안 링크 상수의 주소 %s를 서버가 낸다', async (path) => {
    expect((await fetch(base + path)).status).toBe(200);
  });

  it.each(['/about', '/terms', '/privacy'])('확장자 있는 %s.html은 확장자 없는 주소로 옮긴다', async (path) => {
    const res = await fetch(`${base}${path}.html`, { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(path);
    expect(res.headers.has('set-cookie')).toBe(false);
  });

  it('HEAD 요청도 같은 머리를 낸다', async () => {
    const res = await fetch(`${base}/privacy`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
  });
});
