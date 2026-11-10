// 레이아웃 폭 검사 - 실제 Chrome으로 앱을 열고 뷰포트 폭을 바꿔 가며 PC 헤더의 배치를 재서 판정한다.
// 사용: pnpm layout:check [--json]
//   --json  표 대신 기계가 읽는 결과를 낸다
// 도구가 Vite 개발 서버를 빈 포트에 직접 띄우고 끝나면 종료한다. 서버는 클라우드 모드를 끈 환경에서 뜨고,
// 페이지가 로컬 게스트 모드가 아니면 측정하지 않고 오류로 끝난다. 환경변수 CHROME_PATH가 있으면 그 Chrome을 쓴다.
// 위반이 있거나 실행에 실패하면 종료 코드 1이다. 정상 종료, 오류, 중단 신호 어느 경우에도 띄운 Chrome과 서버를 종료한다.
import { fileURLToPath } from 'node:url';
import { closeAll, launchChrome, sleep, startDevServer } from './layout-check/browser';
import type { Chrome, Page } from './layout-check/browser';
import { expectedTier, formatReport, judgeCase, parseTierClass, summarize } from './layout-check/judge';
import type { Measure, Row, TierClassInfo } from './layout-check/judge';
import {
  SAVE_KEY, TIER_FORMAT, VIEWPORT_HEIGHT, breakpointPx, buildWidths, longestState, longestValue,
} from './layout-check/targets';
import { boatNameOf, MAX_BOAT } from '../src/game/rules/logic';
import { MOBILE_QUERY } from '../src/presentation/layouts/useMobileLayout';
import { HEADER_TIER_CLASS } from '../src/presentation/ui/hud/headerTier';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BAR = 'button[aria-label^="스탯창 열기"]';
const MENU = 'button[aria-label="메뉴 열기"]';

/** 제품의 어댑터 선택 지점이 클라우드 모드인지 묻는다. 개발 서버가 내주는 같은 모듈을 읽으므로 앱이 실제로 쓰는 값이다 */
const IS_CLOUD = `import('/src/platform/adapters/auth.ts').then(m => m.isCloud)`;

/** 페이지에서 헤더와 스테이지의 치수를 잰다. 판정은 하지 않는다. 헤더를 찾지 못하면 null */
const MEASURE = `(() => {
  const box = r => ({ x: r.x, y: r.y, width: r.width, height: r.height });
  const px = (cs, name) => parseFloat(cs.getPropertyValue(name));
  const bar = document.querySelector('${BAR}');
  const menu = document.querySelector('${MENU}');
  const aside = document.querySelector('aside');
  let row = bar;
  while (row && getComputedStyle(row).display !== 'grid') row = row.parentElement;
  if (!bar || !menu || !row || !aside) return null;
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
    sidebarVar: px(getComputedStyle(document.documentElement), '--sidebar-w'),
    tier: { rows: cs.getPropertyValue('--hdr-rows').trim() === 'flex', gap: px(cs, '--hdr-gap') },
    inset: px(cs, '--hdr-inset'),
    stage: box(stage), sidebar: box(aside.getBoundingClientRect()),
    bar: box(bar.parentElement.getBoundingClientRect()), menu: box(menu.getBoundingClientRect()),
    summary: bar.getAttribute('aria-label'), shown: bar.innerText.replace(/\\s+/g, ' ').trim(), clipped, clickables,
  };
})()`;

type Raw = Omit<Measure, 'viewportWidth' | 'stageWidth'> & { sidebarVar: number; summary: string; shown: string };

function parseArgs(argv: string[]): { json: boolean } {
  const unknown = argv.filter(a => a !== '--json');
  if (unknown.length > 0) throw new Error(`알 수 없는 옵션: ${unknown.join(' ')}. 사용법: pnpm layout:check [--json]`);
  return { json: argv.includes('--json') };
}

async function waitReady(page: Page): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await page.evaluate<boolean>(`!!document.querySelector('${BAR}') && !!document.querySelector('${MENU}')`)) {
      await page.evaluate('document.fonts.ready.then(() => true)');
      if (await page.evaluate<boolean>(IS_CLOUD)) {
        throw new Error('앱이 로컬 게스트 모드가 아니라 클라우드 모드로 떴습니다. 서버에 쓰는 검사를 하지 않으므로 측정하지 않습니다.');
      }
      return;
    }
    await sleep(300);
  }
  throw new Error('앱 화면이 시간 안에 그려지지 않았습니다. 자원 바와 메뉴 버튼을 찾지 못했습니다.');
}

/** 상태 하나로 앱을 열고 폭마다 재서 판정한다. save가 있으면 첫 문서가 만들어지기 전에 게스트 세이브로 넣는다 */
async function runState(
  chrome: Chrome, origin: string, name: string, save: { game: object; resource: number } | null,
  widths: readonly number[], info: TierClassInfo,
): Promise<Row[]> {
  return chrome.withPage(async page => {
    if (save) await page.addInitScript(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(save.game))});`);
    await page.setViewport(widths[0], VIEWPORT_HEIGHT);
    await page.navigate(`${origin}/`);
    await waitReady(page);
    const rows: Row[] = [];
    for (const width of widths) {
      await page.setViewport(width, VIEWPORT_HEIGHT);
      await sleep(400);
      const raw = await page.evaluate<Raw | null>(MEASURE);
      if (!raw) throw new Error(`폭 ${width} / ${name}: 헤더를 찾지 못했습니다.`);
      const { sidebarVar, summary, shown, ...rest } = raw;
      const m: Measure = { ...rest, viewportWidth: width, stageWidth: width - sidebarVar };
      if (save) {
        const want = TIER_FORMAT[expectedTier(m.stageWidth, info)](save.resource);
        if (!summary.includes(boatNameOf(MAX_BOAT)) || !summary.includes('Lv.99') || !shown.includes(want)) {
          throw new Error(`폭 ${width} / ${name}: 최장 값 세이브가 자원 바에 반영되지 않았습니다. 기대 표기 ${want}, 실제 ${shown}`);
        }
      }
      rows.push({ width, state: name, shown, result: judgeCase(m, info) });
    }
    return rows;
  });
}

/** 앱을 한 번 열어 사이드바 폭을 읽는다 */
const readSidebar = (chrome: Chrome, origin: string): Promise<number> => chrome.withPage(async page => {
  await page.setViewport(breakpointPx(MOBILE_QUERY), VIEWPORT_HEIGHT);
  await page.navigate(`${origin}/`);
  await waitReady(page);
  return page.evaluate<number>(`parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'))`);
});

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const info = parseTierClass(HEADER_TIER_CLASS);
  const { origin } = await startDevServer(ROOT);
  const chrome = await launchChrome();
  const sidebar = await readSidebar(chrome, origin);
  const widths = buildWidths({ layoutBreak: breakpointPx(MOBILE_QUERY), bounds: info, sidebar });
  // 가장 긴 값은 폭의 헤더 단계가 쓰는 숫자 표기마다 다르므로 값이 같은 폭끼리 묶어 한 페이지로 잰다
  const groups = new Map<number, number[]>();
  for (const w of widths) {
    const resource = longestValue(TIER_FORMAT[expectedTier(w - sidebar, info)]);
    groups.set(resource, [...(groups.get(resource) ?? []), w]);
  }
  const rows = await runState(chrome, origin, '초기', null, widths, info);
  for (const [resource, ws] of groups) {
    rows.push(...await runState(chrome, origin, '최장', { game: longestState(resource), resource }, ws, info));
  }
  rows.sort((a, b) => a.width - b.width || (a.state === b.state ? 0 : a.state === '초기' ? -1 : 1));
  const sum = summarize(rows);
  console.log(opts.json ? JSON.stringify({ ...sum, rows }, null, 2) : formatReport(rows));
  return sum.violations > 0 ? 1 : 0;
}

// 중단 신호에서도 띄운 Chrome과 개발 서버를 종료하고 임시 프로필을 지운 뒤 끝난다
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
  process.once(signal, () => { void closeAll().finally(() => process.exit(code)); });
}

main().then(code => closeAll().then(() => { process.exitCode = code; }), e => {
  console.error(e instanceof Error ? e.message : e);
  return closeAll().then(() => { process.exitCode = 1; });
});
