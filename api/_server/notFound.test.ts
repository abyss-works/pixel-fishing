import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_503_SCRIPT_CSP_HASH, notFoundHtml, serviceUnavailableHtml } from './errorPages.js';
import { legalPages } from './legalPages.js';
import { notFound } from './notFound.js';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
const errorsYamlPath = fileURLToPath(new URL('../../k8s/prod/errors.yaml', import.meta.url));

const THEME_TOKENS = [
  '#0a1526',
  '#14243d',
  '#1d3252',
  '#0f1c31',
  '#2b4568',
  '#f2f7fb',
  '#93a8c4',
  '#ffd54f',
  '#4fc3f7',
  '#ff8a80',
];

const FORBIDDEN_CHARS = /[·—–]/;

function extractConfigMapData(yaml: string, key: string): string {
  const marker = `  ${key}: |-`;
  const startIdx = yaml.indexOf(marker);
  if (startIdx === -1) throw new Error(`ConfigMap key not found: ${key}`);
  const afterMarker = yaml.slice(startIdx + marker.length + 1);
  const lines: string[] = [];
  for (const line of afterMarker.split('\n')) {
    if (line === '' || line.startsWith('    ')) {
      lines.push(line.startsWith('    ') ? line.slice(4) : '');
    } else {
      break;
    }
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n');
}

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

  it('그 밖의 경로는 Cannot GET 없이 noindex, no-store, 승인 문구, 테마 토큰이 담긴 404 HTML을 낸다', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.text();
    expect(body).toContain('noindex');
    expect(body).toContain('href="/"');
    expect(body).not.toContain('Cannot GET');
    expect(body).not.toContain('<script');
    expect(body).toContain('없는 주소');
    expect(body).toContain('찾을 수 없는 페이지');
    expect(body).toContain('주소가 바뀌었거나 지금은 없는 페이지예요.');
    expect(body).toContain('주소를 다시 확인하거나 처음 화면으로 돌아가 보세요.');
    expect(body).toContain('처음 화면으로 돌아가기');
    expect(body).toContain('404');
    expect(body).toContain('clip-path:');
    expect(body).toContain('width="12" height="12"');
    expect(body).not.toMatch(FORBIDDEN_CHARS);
    for (const token of THEME_TOKENS) {
      expect(body).toContain(token);
    }
    expect(body).toBe(notFoundHtml());
  });

  it('등록된 경로는 404로 먹히지 않는다', async () => {
    for (const path of ['/', '/index.html', '/terms', '/robots.txt', '/api/ping']) {
      const res = await fetch(`${base}${path}`, { redirect: 'manual' });
      expect(res.status, path).toBe(200);
    }
  });
});

describe('503 안내 페이지와 k8s 정합', () => {
  it('serviceUnavailableHtml은 승인 문구, 테마 토큰, 자동 재확인 스크립트와 CSP 해시를 가진다', () => {
    const html = serviceUnavailableHtml();
    expect(html).toContain('noindex');
    expect(html).toContain('연결 대기');
    expect(html).toContain('잠시 게임 점검 중');
    expect(html).toContain('정비 중이거나 일시적으로 연결이 멈춰 있어요.');
    expect(html).toContain('준비가 끝나는 대로 저장된 진행에서 바로 이어져요.');
    expect(html).toContain('<span id="countdown">5</span>초 뒤에 자동으로 다시 확인해요.');
    expect(html).toContain('role="status"');
    expect(html).toContain('연결 상태를 확인하고 있어요.');
    expect(html).toContain('아직 연결되지 않아 조금 뒤에 다시 확인해 주세요.');
    expect(html).toContain('다시 연결하기');
    expect(html).toContain('href="/"');
    expect(html).toContain('처음 화면으로');
    expect(html).toContain('503');
    expect(html).toContain('clip-path:');
    expect(html).toContain('width="12" height="12"');
    expect(html).not.toMatch(FORBIDDEN_CHARS);
    for (const token of THEME_TOKENS) {
      expect(html).toContain(token);
    }

    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    const expectedHash = `'sha256-${createHash('sha256').update(scriptMatch![1], 'utf8').digest('base64')}'`;
    expect(ERROR_503_SCRIPT_CSP_HASH).toBe(expectedHash);
  });

  it('k8s/prod/errors.yaml의 503.html과 default.conf CSP 해시가 서버 생성 결과와 일치한다', () => {
    const yaml = readFileSync(errorsYamlPath, 'utf8');
    const htmlInYaml = extractConfigMapData(yaml, '503.html');
    expect(htmlInYaml).toBe(serviceUnavailableHtml());

    const confInYaml = extractConfigMapData(yaml, 'default.conf');
    expect(confInYaml).toContain(ERROR_503_SCRIPT_CSP_HASH);
  });
});
