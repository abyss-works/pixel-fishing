import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { guardedFetch } from './http';

let server: Server | null = null;
afterEach(() => { server?.close(); server = null; });

describe('guardedFetch', () => {
  it('리다이렉트를 따라가지 않고 실패한다', async () => {
    server = createServer((_req, res) => { res.writeHead(302, { location: 'https://example.invalid/' }).end(); });
    await new Promise<void>(r => server?.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    await expect(guardedFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
  });

  it('일반 응답은 그대로 돌려준다', async () => {
    server = createServer((_req, res) => { res.writeHead(204).end(); });
    await new Promise<void>(r => server?.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    expect((await guardedFetch(`http://127.0.0.1:${port}/`)).status).toBe(204);
  });

  it('도구 코드는 fetch를 http 모듈을 거쳐서만 부른다', () => {
    const files = readdirSync(import.meta.dirname).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'http.ts');
    for (const f of files) {
      expect(readFileSync(new URL(f, import.meta.url), 'utf8'), f).not.toMatch(/(?<![\w.])fetch\(/);
    }
  });
});
