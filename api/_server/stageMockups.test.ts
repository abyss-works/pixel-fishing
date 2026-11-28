// 스테이징 전용 시안 HTML 정적 서빙 라우터 단위·통합 테스트.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, securityHeaders } from './securityHeaders.js';
import { stageGate } from './stageGate.js';
import { MOCKUPS_CSP, stageMockups } from './stageMockups.js';

const EXPECTED_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'";

async function startTestServer(options: { checkAdmin?: 'allow' | '401' | '403' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders({ origin: 'https://pixel-fishing-preview.abyssworks.dev' }));
  if (options.checkAdmin) {
    const checkAdmin =
      options.checkAdmin === 'allow'
        ? async () => ({ ok: true as const, uid: 'admin-1' })
        : options.checkAdmin === '401'
          ? async () => ({ ok: false as const, status: 401 as const })
          : async () => ({ ok: false as const, status: 403 as const });
    app.use(stageGate({ checkAdmin }));
  }
  app.use(stageMockups());
  app.get('/api/ping', (_req, res) => { res.json({ ok: true }); });
  app.get('/', (_req, res) => { res.type('html').send('<!doctype html><html><body>app</body></html>'); });
  app.use((_req, res) => { res.status(404).type('text').send('not-found'); });

  const server: Server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    close: () => new Promise<void>(resolve => { server.close(() => resolve()); }),
  };
}

describe('stageMockups 미들웨어', () => {
  let rootDir: string;
  let mockupsDir: string;
  let outsideDir: string;
  const savedDeployEnv = process.env.DEPLOY_ENV;
  const savedMockupsDir = process.env.MOCKUPS_DIR;

  beforeAll(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'pf-stage-mockups-'));
    mockupsDir = join(rootDir, 'mockups');
    outsideDir = join(rootDir, 'outside');
    mkdirSync(mockupsDir);
    mkdirSync(outsideDir);
  });

  afterEach(() => {
    if (savedDeployEnv === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = savedDeployEnv;
    if (savedMockupsDir === undefined) delete process.env.MOCKUPS_DIR;
    else process.env.MOCKUPS_DIR = savedMockupsDir;
  });

  afterAll(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('DEPLOY_ENV가 preview가 아니거나 MOCKUPS_DIR이 비어 있으면 라우트를 비활성화한다', async () => {
    const samplePath = join(mockupsDir, 'enabled-check.html');
    writeFileSync(samplePath, '<!doctype html><h1>ok</h1>');
    const srv = await startTestServer();
    try {
      for (const env of ['production', 'local', '', undefined]) {
        if (env === undefined) delete process.env.DEPLOY_ENV;
        else process.env.DEPLOY_ENV = env;
        process.env.MOCKUPS_DIR = mockupsDir;

        const listRes = await fetch(`${srv.base}/_mockups`);
        expect(listRes.status, `DEPLOY_ENV=${String(env)} list`).toBe(404);
        const fileRes = await fetch(`${srv.base}/_mockups/enabled-check.html`);
        expect(fileRes.status, `DEPLOY_ENV=${String(env)} file`).toBe(404);
      }

      process.env.DEPLOY_ENV = 'preview';
      for (const dir of ['', undefined]) {
        if (dir === undefined) delete process.env.MOCKUPS_DIR;
        else process.env.MOCKUPS_DIR = dir;

        const listRes = await fetch(`${srv.base}/_mockups`);
        expect(listRes.status, `MOCKUPS_DIR=${String(dir)} list`).toBe(404);
        const fileRes = await fetch(`${srv.base}/_mockups/enabled-check.html`);
        expect(fileRes.status, `MOCKUPS_DIR=${String(dir)} file`).toBe(404);
      }
    } finally {
      await srv.close();
      rmSync(samplePath, { force: true });
    }
  });

  it('stageGate 뒤에서 동작해 미인증·비관리자 요청을 401·403으로 차단하고 관리자만 통과시킨다', async () => {
    const filePath = join(mockupsDir, 'gated.html');
    writeFileSync(filePath, '<!doctype html><h1>secret mockup</h1>');
    process.env.DEPLOY_ENV = 'preview';
    process.env.MOCKUPS_DIR = mockupsDir;

    const srv401 = await startTestServer({ checkAdmin: '401' });
    const srv403 = await startTestServer({ checkAdmin: '403' });
    const srvOk = await startTestServer({ checkAdmin: 'allow' });
    try {
      for (const path of ['/_mockups', '/_mockups/', '/_mockups/gated.html']) {
        const res401 = await fetch(`${srv401.base}${path}`);
        expect(res401.status, `401 ${path}`).toBe(401);
        expect(await res401.text()).toContain('스테이징 관리자 인증');

        const res403 = await fetch(`${srv403.base}${path}`);
        expect(res403.status, `403 ${path}`).toBe(403);
        expect(await res403.text()).toContain('스테이징 접근 제한');

        const resOk = await fetch(`${srvOk.base}${path}`);
        expect(resOk.status, `200 ${path}`).toBe(200);
      }
    } finally {
      await Promise.all([srv401.close(), srv403.close(), srvOk.close()]);
      rmSync(filePath, { force: true });
    }
  });

  it('경로 탈출(..), 비-.html 확장자, 잘못된 파일명, 외부 심볼릭 링크를 차단한다', async () => {
    const dir = join(rootDir, 'security-case');
    mkdirSync(dir, { recursive: true });
    const validFile = join(dir, 'valid-v0.20.4_1.html');
    writeFileSync(validFile, '<!doctype html><p>valid</p>');
    writeFileSync(join(dir, 'notes.txt'), 'secret text');
    writeFileSync(join(dir, '.env'), 'SECRET=1');
    mkdirSync(join(dir, 'subdir.html'), { recursive: true });

    const outsideSecret = join(outsideDir, 'outside.html');
    writeFileSync(outsideSecret, '<!doctype html><p>outside secret</p>');
    symlinkSync(outsideSecret, join(dir, 'escape.html'));

    process.env.DEPLOY_ENV = 'preview';
    process.env.MOCKUPS_DIR = dir;
    const srv = await startTestServer({ checkAdmin: 'allow' });
    try {
      for (const badPath of [
        '/_mockups/..%2Foutside.html',
        '/_mockups/..%5Coutside.html',
        '/_mockups/notes.txt',
        '/_mockups/.env',
        '/_mockups/script.js',
        '/_mockups/valid.html.bak',
        '/_mockups/bad%20name.html',
        '/_mockups/valid%00.html',
        '/_mockups/sub/valid-v0.20.4_1.html',
      ]) {
        const res = await fetch(`${srv.base}${badPath}`);
        expect(res.status, badPath).toBe(400);
      }

      // fetch()는 전송 전 URL의 ../%2e%2e 세그먼트를 정규화하므로 raw HTTP 요청으로 직접 검증한다.
      const url = new URL(srv.base);
      for (const rawPath of ['/_mockups/..', '/_mockups/%2e%2e', '/_mockups/../outside.html']) {
        const status = await new Promise<number>((resolve, reject) => {
          const req = httpRequest(
            { hostname: url.hostname, port: Number(url.port), path: rawPath, method: 'GET' },
            res => {
              res.resume();
              resolve(res.statusCode ?? 0);
            },
          );
          req.on('error', reject);
          req.end();
        });
        expect(status, `raw ${rawPath}`).toBe(400);
      }

      const symlinkRes = await fetch(`${srv.base}/_mockups/escape.html`);
      expect(symlinkRes.status).toBe(404);

      const dirRes = await fetch(`${srv.base}/_mockups/subdir.html`);
      expect(dirRes.status).toBe(404);

      const missingRes = await fetch(`${srv.base}/_mockups/missing.html`);
      expect(missingRes.status).toBe(404);

      const okRes = await fetch(`${srv.base}/_mockups/valid-v0.20.4_1.html`);
      expect(okRes.status).toBe(200);
      expect(await okRes.text()).toBe('<!doctype html><p>valid</p>');
    } finally {
      await srv.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('유효한 시안과 목록 응답에 Cache-Control: no-store 및 완화 CSP를 적용하고 메인 앱 CSP는 유지한다', async () => {
    const dir = join(rootDir, 'headers-case');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'alpha.html'), '<!doctype html><script>console.log(1)</script>');

    process.env.DEPLOY_ENV = 'preview';
    process.env.MOCKUPS_DIR = dir;
    const srv = await startTestServer({ checkAdmin: 'allow' });
    try {
      expect(MOCKUPS_CSP).toBe(EXPECTED_CSP);

      for (const path of ['/_mockups', '/_mockups/', '/_mockups/alpha.html']) {
        const res = await fetch(`${srv.base}${path}`);
        expect(res.status, path).toBe(200);
        expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(res.headers.get('content-security-policy')).toBe(EXPECTED_CSP);
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        expect(res.headers.get('x-frame-options')).toBe('DENY');
      }

      const appRes = await fetch(`${srv.base}/`);
      expect(appRes.status).toBe(200);
      const appCsp = appRes.headers.get('content-security-policy') ?? '';
      expect(appCsp).toBe(buildContentSecurityPolicy({ origin: 'https://pixel-fishing-preview.abyssworks.dev' }));
      expect(appCsp).not.toContain('fonts.googleapis.com');
      expect(appCsp).not.toContain('unsafe-inline; style-src');
    } finally {
      await srv.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('/_mockups 목록은 정규 .html 파일만 최신 수정 시각 내림차순·파일명 내림차순으로 정렬하고 빈 상태를 안내한다', async () => {
    const dir = join(rootDir, 'listing-case');
    mkdirSync(dir, { recursive: true });

    const fOld = join(dir, '01-old.html');
    const fSameA = join(dir, 'a-same.html');
    const fSameB = join(dir, 'b-same.html');
    const fNewest = join(dir, '02-newest.html');
    writeFileSync(fOld, '<h1>old</h1>');
    writeFileSync(fSameA, '<h1>a</h1>');
    writeFileSync(fSameB, '<h1>b</h1>');
    writeFileSync(fNewest, '<h1>newest</h1>');
    writeFileSync(join(dir, 'ignored.txt'), 'not html');
    mkdirSync(join(dir, 'nested.html'));
    symlinkSync(join(outsideDir, 'outside.html'), join(dir, 'symlink.html'));

    utimesSync(fOld, new Date('2026-11-20T00:00:00Z'), new Date('2026-11-20T00:00:00Z'));
    utimesSync(fSameA, new Date('2026-11-22T00:00:00Z'), new Date('2026-11-22T00:00:00Z'));
    utimesSync(fSameB, new Date('2026-11-22T00:00:00Z'), new Date('2026-11-22T00:00:00Z'));
    utimesSync(fNewest, new Date('2026-11-25T00:00:00Z'), new Date('2026-11-25T00:00:00Z'));

    const emptyDir = join(rootDir, 'empty-case');
    mkdirSync(emptyDir, { recursive: true });

    process.env.DEPLOY_ENV = 'preview';
    process.env.MOCKUPS_DIR = dir;
    const srv = await startTestServer({ checkAdmin: 'allow' });
    try {
      const res = await fetch(`${srv.base}/_mockups`);
      expect(res.status).toBe(200);
      const html = await res.text();
      const hrefs = [...html.matchAll(/href="(\/_mockups\/[^"]+)"/g)].map(m => m[1]);
      expect(hrefs).toEqual([
        '/_mockups/02-newest.html',
        '/_mockups/b-same.html',
        '/_mockups/a-same.html',
        '/_mockups/01-old.html',
      ]);
      expect(html).not.toContain('ignored.txt');
      expect(html).not.toContain('nested.html');
      expect(html).not.toContain('symlink.html');

      process.env.MOCKUPS_DIR = emptyDir;
      const emptyRes = await fetch(`${srv.base}/_mockups/`);
      expect(emptyRes.status).toBe(200);
      const emptyHtml = await emptyRes.text();
      expect(emptyHtml).toContain('시안');
      expect(emptyHtml).not.toContain('href="/_mockups/');
    } finally {
      await srv.close();
      rmSync(dir, { recursive: true, force: true });
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe('서버 진입점 stageMockups 등록 순서', () => {
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

  it('stageGate 뒤에서 DEPLOY_ENV === preview 및 MOCKUPS_DIR 조건일 때만 stageMockups를 등록한다', () => {
    const gateIdx = main.indexOf('app.use(stageGate())');
    const mockupIdx = main.indexOf('stageMockups(');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(mockupIdx).toBeGreaterThan(gateIdx);
    expect(main).toContain("process.env.DEPLOY_ENV === 'preview'");
    expect(main).toContain('process.env.MOCKUPS_DIR');
  });
});
