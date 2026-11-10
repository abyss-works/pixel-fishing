// 레이아웃 폭 검사 - 실제 Chrome으로 앱을 열고 뷰포트 폭을 바꿔 가며 PC 헤더의 배치를 재서 판정한다.
// 사용: pnpm layout:check [--url <주소>] [--json] [--widths 768,1024] [--bounds <간격 축소 경계>,<기본 경계>]
//   --url     이미 떠 있는 서버를 쓴다. 없으면 Vite 개발 서버를 빈 포트에 띄우고 끝나면 종료한다. 로그인 없이 게스트로 연다
//   --json    표 대신 기계가 읽는 결과를 낸다
//   --widths  뷰포트 폭 목록을 바꾼다(기본은 targets의 목록)
//   --bounds  판정에 쓸 단계 경계를 일부러 바꾼다. 검사가 위반을 잡는지 확인하는 용도다
// 환경변수 CHROME_PATH가 있으면 그 Chrome을 쓴다. 위반이 있거나 실행에 실패하면 종료 코드 1이다.
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, startDevServer } from './layout-check/browser';
import type { Page } from './layout-check/browser';
import { formatReport, judgeCase, parseTierClass, summarize } from './layout-check/judge';
import type { Measure, Row, TierClassInfo } from './layout-check/judge';
import { SAVE_KEY, VIEWPORT_HEIGHT, VIEWPORT_WIDTHS, longestState } from './layout-check/targets';
import { boatNameOf, MAX_BOAT } from '../src/game/rules/logic';
import { HEADER_TIER_CLASS } from '../src/presentation/ui/hud/headerTier';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BAR = 'button[aria-label^="스탯창 열기"]';
const MENU = 'button[aria-label="메뉴 열기"]';

/** 페이지에서 헤더와 스테이지의 치수를 잰다. 판정은 하지 않는다 */
const MEASURE = `(() => {
  const box = r => ({ x: r.x, y: r.y, width: r.width, height: r.height });
  const px = (cs, name) => parseFloat(cs.getPropertyValue(name));
  const bar = document.querySelector('${BAR}');
  const menu = document.querySelector('${MENU}');
  let row = bar;
  while (row && getComputedStyle(row).display !== 'grid') row = row.parentElement;
  if (!bar || !menu || !row) return null;
  const stage = row.parentElement.getBoundingClientRect();
  const cs = getComputedStyle(row);
  const visible = el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return el.getClientRects().length > 0 && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  // 글자를 담은 요소(조상 상자 포함)가 내용보다 좁아 잘리는가. 인라인 요소는 상자 폭이 0이라 담는 상자에서 잡힌다
  const clipped = [...row.querySelectorAll('*')]
    .filter(el => el.textContent.trim())
    .filter(el => visible(el) && !el.closest('.sr-only') && el.scrollWidth > el.clientWidth)
    .map(el => ({ text: el.textContent.trim().slice(0, 30), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  const fields = [...document.querySelectorAll('button, a[href], input, textarea, select, [role="button"]')]
    .filter(el => visible(el) && getComputedStyle(el).pointerEvents !== 'none')
    .filter(el => { const r = el.getBoundingClientRect(); const cx = r.x + r.width / 2; return cx >= stage.x && cx <= stage.right; });
  const clickables = fields.filter(el => !fields.some(o => o !== el && el.contains(o)))
    .map(el => ({ label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24), rect: box(el.getBoundingClientRect()) }));
  return {
    sidebar: px(getComputedStyle(document.documentElement), '--sidebar-w'),
    scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    tier: { rows: cs.getPropertyValue('--hdr-rows').trim() === 'flex', gap: px(cs, '--hdr-gap') },
    inset: px(cs, '--hdr-inset'),
    stage: box(stage), bar: box(bar.parentElement.getBoundingClientRect()), menu: box(menu.getBoundingClientRect()),
    summary: bar.getAttribute('aria-label'), clipped, clickables,
  };
})()`;

type Raw = Omit<Measure, 'viewportWidth' | 'stageWidth'> & { sidebar: number; summary: string };

interface Options { url: string | null; json: boolean; widths: number[]; bounds: [number, number] | null }

function parseArgs(argv: string[]): Options {
  const opts: Options = { url: null, json: false, widths: [...VIEWPORT_WIDTHS], bounds: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} 값이 필요합니다.`);
      return v;
    };
    if (a === '--url') opts.url = value();
    else if (a === '--json') opts.json = true;
    else if (a === '--widths') opts.widths = value().split(',').map(Number);
    else if (a === '--bounds') opts.bounds = value().split(',').map(Number) as [number, number];
    else throw new Error(`알 수 없는 옵션: ${a}`);
  }
  if (opts.widths.some(w => !Number.isInteger(w) || w <= 0)) throw new Error('--widths는 쉼표로 나눈 양의 정수여야 합니다.');
  if (opts.bounds && (opts.bounds.length !== 2 || opts.bounds.some(b => !Number.isInteger(b)))) throw new Error('--bounds는 정수 두 개입니다.');
  return opts;
}

async function waitReady(page: Page): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await page.evaluate<boolean>(`!!document.querySelector('${BAR}') && !!document.querySelector('${MENU}')`)) {
      await page.evaluate('document.fonts.ready.then(() => true)');
      return;
    }
    await sleep(300);
  }
  throw new Error('앱 화면이 시간 안에 그려지지 않았습니다(자원 바와 메뉴 버튼을 찾지 못함).');
}

/** 상태 하나로 앱을 열고 폭마다 재서 판정한다 */
async function runState(
  chrome: Awaited<ReturnType<typeof launchChrome>>, origin: string, name: string, save: object | null,
  widths: number[], info: TierClassInfo,
): Promise<Row[]> {
  return chrome.withPage(async page => {
    if (save) await page.addInitScript(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(save))});`);
    await page.setViewport(widths[0], VIEWPORT_HEIGHT);
    await page.navigate(`${origin}/`);
    await waitReady(page);
    const rows: Row[] = [];
    for (const width of widths) {
      await page.setViewport(width, VIEWPORT_HEIGHT);
      await sleep(400);
      const raw = await page.evaluate<Raw | null>(MEASURE);
      if (!raw) throw new Error(`폭 ${width} / ${name}: 헤더를 찾지 못했습니다.`);
      const { sidebar, summary, ...rest } = raw;
      if (save && !(summary.includes(boatNameOf(MAX_BOAT)) && summary.includes('Lv.99'))) {
        throw new Error(`폭 ${width} / ${name}: 최장 값 세이브가 반영되지 않았습니다(${summary}).`);
      }
      const m: Measure = { ...rest, viewportWidth: width, stageWidth: width - sidebar };
      rows.push({ width, state: name, result: judgeCase(m, { bounds: info, baseGap: info.baseGap }) });
    }
    return rows;
  });
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const parsed = parseTierClass(HEADER_TIER_CLASS);
  const info = opts.bounds ? { ...parsed, tight: opts.bounds[0], wide: opts.bounds[1] } : parsed;
  const server = opts.url ? null : await startDevServer(ROOT);
  let chrome: Awaited<ReturnType<typeof launchChrome>> | null = null;
  try {
    const origin = (opts.url ?? server!.origin).replace(/\/$/, '');
    chrome = await launchChrome();
    const rows = [
      ...await runState(chrome, origin, '초기', null, opts.widths, info),
      ...await runState(chrome, origin, '최장', longestState(), opts.widths, info),
    ];
    const sum = summarize(rows);
    console.log(opts.json ? JSON.stringify({ ...sum, rows }, null, 2) : formatReport(rows));
    return sum.violations > 0 ? 1 : 0;
  } finally {
    await chrome?.close();
    server?.close();
  }
}

main().then(code => { process.exitCode = code; }, e => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
