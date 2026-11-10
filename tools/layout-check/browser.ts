// 브라우저 구동 경계 - Chrome 기동, DevTools 프로토콜 호출, 개발 서버 기동과 종료를 이 파일에만 모은다.
// 새 패키지 없이 설치된 Chrome을 헤드리스로 띄우고 Node 내장 WebSocket으로 프로토콜을 직접 호출한다.
// 호출마다 제한 시간을 두고, 닫기는 프로세스 트리를 종료한다.
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const sleep = (ms: number) => new Promise<void>(ok => setTimeout(ok, ms));

const SEND_TIMEOUT_MS = 20_000;
const SERVER_START_TIMEOUT_MS = 60_000;

/** 통상 설치 경로 후보. CHROME_PATH가 있으면 그것만 쓴다 */
export function chromeCandidates(platform: NodeJS.Platform, env: Record<string, string | undefined>): string[] {
  if (env.CHROME_PATH) return [env.CHROME_PATH];
  if (platform === 'win32') {
    return ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA']
      .map(k => env[k]).filter((v): v is string => !!v)
      .map(base => join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  if (platform === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}

export function findChrome(): string {
  const candidates = chromeCandidates(process.platform, process.env);
  const found = candidates.find(p => existsSync(p));
  if (!found) {
    throw new Error(`Chrome 실행 파일을 찾지 못했습니다. 환경변수 CHROME_PATH에 경로를 지정하세요. 확인한 경로: ${candidates.join(', ')}`);
  }
  return found;
}

/** 자식 프로세스와 그 하위 프로세스를 모두 종료한다 */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
}

const freePort = (): Promise<number> => new Promise((ok, fail) => {
  const s = createServer();
  s.once('error', fail);
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address() as { port: number };
    s.close(() => ok(port));
  });
});

/** 제품 저장소 루트에서 Vite 개발 서버를 빈 포트에 띄운다. close는 서버 프로세스 트리를 종료한다 */
export async function startDevServer(root: string): Promise<{ origin: string; close: () => void }> {
  const port = await freePort();
  const viteBin = join(dirname(createRequire(join(root, 'package.json')).resolve('vite/package.json')), 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root, stdio: 'ignore', detached: process.platform !== 'win32',
  });
  const origin = `http://127.0.0.1:${port}`;
  const close = () => killTree(child);
  try {
    const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
    for (;;) {
      if (child.exitCode !== null) throw new Error('개발 서버가 시작 중에 종료됐습니다.');
      if (Date.now() > deadline) throw new Error('개발 서버가 시간 안에 응답하지 않았습니다.');
      if (await fetch(origin).then(r => r.ok, () => false)) break;
      await sleep(300);
    }
  } catch (e) {
    close();
    throw e;
  }
  return { origin, close };
}

type Pending = { ok: (v: unknown) => void; fail: (e: Error) => void };

/** DevTools 프로토콜 연결 하나. send는 응답의 result를 돌려준다 */
async function connect(url: string) {
  const ws = new WebSocket(url);
  await new Promise<void>((ok, fail) => { ws.onopen = () => ok(); ws.onerror = () => fail(new Error('DevTools 연결에 실패했습니다.')); });
  let seq = 0;
  const waiting = new Map<number, Pending>();
  ws.onmessage = e => {
    const msg = JSON.parse(String(e.data)) as { id?: number; result?: unknown; error?: { message: string } };
    const w = msg.id === undefined ? undefined : waiting.get(msg.id);
    if (!w || msg.id === undefined) return;
    waiting.delete(msg.id);
    if (msg.error) w.fail(new Error(msg.error.message)); else w.ok(msg.result);
  };
  return {
    send: <T = Record<string, unknown>>(method: string, params: object = {}, sessionId?: string) => new Promise<T>((ok, fail) => {
      const id = ++seq;
      const timer = setTimeout(() => { waiting.delete(id); fail(new Error(`${method} 응답 시간 초과`)); }, SEND_TIMEOUT_MS);
      waiting.set(id, {
        ok: v => { clearTimeout(timer); ok(v as T); },
        fail: e => { clearTimeout(timer); fail(e); },
      });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    }),
    close: () => ws.close(),
  };
}

export interface Page {
  /** 페이지에서 식 하나를 실행하고 값을 돌려준다. Promise면 기다린다 */
  evaluate: <T>(expression: string) => Promise<T>;
  setViewport: (width: number, height: number) => Promise<void>;
  /** 새 문서가 만들어질 때마다 먼저 실행할 스크립트 */
  addInitScript: (source: string) => Promise<void>;
  navigate: (url: string) => Promise<void>;
}

export interface Chrome {
  /** 저장소가 격리된 컨텍스트에서 페이지 하나를 열어 fn을 실행하고 닫는다 */
  withPage: <T>(fn: (page: Page) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

/** 헤드리스 Chrome을 별도 사용자 데이터 폴더로 띄운다 */
export async function launchChrome(): Promise<Chrome> {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'pf-layout-check-'));
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore', detached: process.platform !== 'win32' });
  const cleanup = async () => {
    killTree(child);
    await sleep(300);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  try {
    const portFile = join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
    if (!existsSync(portFile)) throw new Error(`Chrome을 시작하지 못했습니다: ${chrome}`);
    const [port, path] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    const browser = await connect(`ws://127.0.0.1:${port}${path}`);
    return {
      async withPage(fn) {
        const { browserContextId } = await browser.send<{ browserContextId: string }>('Target.createBrowserContext');
        const { targetId } = await browser.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank', browserContextId });
        try {
          const { sessionId } = await browser.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
          const send = <R,>(method: string, params?: object) => browser.send<R>(method, params, sessionId);
          const page: Page = {
            async evaluate<T>(expression: string) {
              const r = await send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
                'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
              if (r.exceptionDetails) throw new Error(`페이지 식 실행 오류: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
              return r.result.value;
            },
            async setViewport(width, height) {
              await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            },
            async addInitScript(source) { await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument', { source }); },
            async navigate(url) { await send('Page.navigate', { url }); },
          };
          return await fn(page);
        } finally {
          await browser.send('Target.closeTarget', { targetId }).catch(() => {});
          await browser.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
        }
      },
      async close() { browser.close(); await cleanup(); },
    };
  } catch (e) {
    await cleanup();
    throw e;
  }
}
