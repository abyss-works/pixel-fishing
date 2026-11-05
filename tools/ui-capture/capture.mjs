// 스테이지 UI 캡처 — Storybook 정적 빌드를 만들고, 대상 스토리마다 헤드리스 Chrome으로 PNG를 찍는다.
//
// 사용법(제품 저장소 루트에서):
//   node tools/ui-capture/capture.mjs
//   node tools/ui-capture/capture.mjs --filter stage-friends --out C:\captures\today
//   node tools/ui-capture/capture.mjs --storybook-dir C:\tmp\sb   (이미 만든 빌드를 다시 쓴다)
//
// 옵션
//   --out <dir>            저장 폴더. 기본값은 ~/ws_remote/_outbox/pixel-fishing/captures/<YYYY-MM-DD>
//   --filter <text>        스토리 id에 이 문자열이 들어간 것만 찍는다(여러 번 줄 수 있다)
//   --storybook-dir <dir>  빌드를 건너뛰고 이 폴더의 정적 빌드를 쓴다
//   --keep-build           새로 만든 빌드 폴더를 지우지 않는다
//   --concurrency <n>      동시에 여는 탭 수(기본 4)
// 환경 변수
//   CHROME_PATH            Chrome 실행 파일. 기본값은 Windows 기본 설치 경로
//
// file://로 연 iframe.html은 모듈 로딩이 막혀 그려지지 않는다. 그래서 캡처하는 동안에만 127.0.0.1에
// 정적 서버를 띄우고, 끝나면 닫는다. 개발 서버는 띄우지 않는다. Chrome은 화면 없이 실행된다.
// 스크롤 막대가 내용과 겹치는지 보려고 막대를 숨기지 않는다.
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGETS } from './targets.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.map': 'application/json',
};

function parseArgs(argv) {
  const opts = { filters: [], concurrency: 4, keepBuild: false, out: null, storybookDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--filter') opts.filters.push(argv[++i]);
    else if (a === '--storybook-dir') opts.storybookDir = argv[++i];
    else if (a === '--keep-build') opts.keepBuild = true;
    else if (a === '--concurrency') opts.concurrency = Math.max(1, Number(argv[++i]) || 1);
    else throw new Error(`알 수 없는 옵션: ${a}`);
  }
  return opts;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function buildStorybook(dir) {
  console.log(`Storybook 빌드: ${dir}`);
  const r = spawnSync('npx', ['storybook', 'build', '--quiet', '--disable-telemetry', '-o', dir], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error(`storybook build 실패 (exit ${r.status})`);
}

/** 정적 빌드 폴더를 127.0.0.1의 빈 포트로 내려주는 서버. 주소와 닫기 함수를 돌려준다 */
function serve(dir) {
  const base = resolve(dir);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    let file = normalize(join(base, path));
    if (!file.startsWith(base + sep) && file !== base) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise(ok => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      ok({ origin: `http://127.0.0.1:${port}`, close: () => new Promise(done => server.close(done)) });
    });
  });
}

/** 스토리 하나의 창 크기. 맞는 대상이 없으면 찍지 않는다 */
function sizeOf(entry) {
  const target = TARGETS.find(t => (t.id ? t.id === entry.id : entry.title.startsWith(t.title)));
  return target ? { width: target.width, height: target.height } : null;
}

// 헤드리스 Chrome 하나를 DevTools 프로토콜로 조종한다. --screenshot 단일 실행은 가상 시간 아래에서 MSW 서비스 워커
// 시작을 기다리지 못해 스토리가 그려지지 않으므로, 실제 시간으로 그려질 때까지 기다린 뒤 찍는다.
async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'pf-capture-'));
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) { child.kill(); throw new Error(`Chrome을 시작하지 못했습니다: ${CHROME}`); }
  const [port, path] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
  const browser = await connect(`ws://127.0.0.1:${port}${path}`);
  return {
    browser,
    close: async () => {
      browser.close();
      child.kill();
      await sleep(300);
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

const sleep = ms => new Promise(ok => setTimeout(ok, ms));

/** DevTools 프로토콜 연결 하나. send는 응답의 result를 돌려준다 */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let seq = 0;
  const waiting = new Map();
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.error) w.fail(new Error(msg.error.message)); else w.ok(msg.result);
  };
  return {
    send: (method, params = {}, sessionId) => new Promise((ok, fail) => {
      const id = ++seq;
      waiting.set(id, { ok, fail });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    }),
    close: () => ws.close(),
  };
}

/** 스토리가 그려졌는가(오류 화면 포함). Storybook이 렌더 단계를 body 클래스로 알린다 */
const READY = `document.body.classList.contains('sb-show-main') || document.body.classList.contains('sb-show-errordisplay')`;

async function capture(browser, origin, entry, size, outDir) {
  const png = join(outDir, `${entry.id}.png`);
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${origin}/iframe.html?id=${entry.id}&viewMode=story` });
    let ready = false;
    for (let i = 0; i < 150 && !ready; i++) {
      await sleep(100);
      ready = (await send('Runtime.evaluate', { expression: READY })).result.value === true;
    }
    const error = (await send('Runtime.evaluate', {
      expression: `document.body.classList.contains('sb-show-errordisplay')`,
    })).result.value === true;
    // 글꼴, 조회 응답, 등장 애니메이션이 끝날 때까지 기다린다
    await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
    await sleep(1200);
    const { data } = await send('Page.captureScreenshot', {
      format: 'png', clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
    });
    writeFileSync(png, Buffer.from(data, 'base64'));
    return { id: entry.id, ok: ready && !error, png, note: !ready ? '렌더 대기 시간 초과' : error ? '스토리 오류 화면' : '' };
  } finally {
    await browser.send('Target.closeTarget', { targetId });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = resolve(opts.out ?? join(homedir(), 'ws_remote', '_outbox', 'pixel-fishing', 'captures', today()));
  const sbDir = opts.storybookDir ? resolve(opts.storybookDir) : mkdtempSync(join(tmpdir(), 'pf-storybook-'));
  if (!opts.storybookDir) buildStorybook(sbDir);
  mkdirSync(outDir, { recursive: true });

  const index = JSON.parse(readFileSync(join(sbDir, 'index.json'), 'utf8'));
  const entries = Object.values(index.entries)
    .filter(e => e.type === 'story')
    .filter(e => opts.filters.length === 0 || opts.filters.some(f => e.id.includes(f)))
    .map(e => ({ entry: e, size: sizeOf(e) }))
    .filter(e => e.size);
  if (entries.length === 0) throw new Error('찍을 스토리가 없습니다. targets.mjs와 --filter를 확인하세요.');

  const server = await serve(sbDir);
  console.log(`정적 서버: ${server.origin} (캡처가 끝나면 닫는다)`);
  const results = [];
  let chrome = null;
  try {
    chrome = await launchChrome();
    const queue = [...entries];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const r = await capture(chrome.browser, server.origin, item.entry, item.size, outDir);
        console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.id}${r.note ? ` (${r.note})` : ''}`);
        results.push(r);
      }
    };
    await Promise.all(Array.from({ length: opts.concurrency }, worker));
  } finally {
    await chrome?.close();
    await server.close();
    if (!opts.storybookDir && !opts.keepBuild) rmSync(sbDir, { recursive: true, force: true });
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length}장 저장: ${outDir}`);
  if (opts.keepBuild && !opts.storybookDir) console.log(`빌드 폴더: ${sbDir}`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
