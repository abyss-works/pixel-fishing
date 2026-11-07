// UI 시스템 가드 — 화면(views·layouts)이 공용 UI(ui)를 조합하고, 기본 요소를 직접 구현하지 않게 한다.
// 한 번만 쓰는 화면 조각은 그 화면 파일 안의 지역 컴포넌트로 만들 수 있다. 단 두 화면 이상에 같은 이름의
// 지역 컴포넌트가 생기면 공용 UI로 올려야 한다. 예외 목록은 줄이기만 한다(새 예외를 더하지 않는다).
import { describe, expect, it } from 'vitest';
import { SCROLL_Y } from './scrollArea';

const sources = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
/** 게임 화면 전체(표현·기능·앱 진입). 관리자 화면은 따로 정한다 */
const appSources = Object.entries(import.meta.glob('../../**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>)
  .filter(([key]) => !/\.test\.tsx?$/.test(key) && !/\/admin\//.test(key));

/** glob 키 → presentation 기준 경로. 이 파일과 같은 폴더(ui)는 './X', 나머지는 '../views/X'로 온다 */
const rel = (key: string) => (key.startsWith('./') ? `ui/${key.slice(2)}` : key.replace(/^\.\.\//, ''));
const isTestFile = (path: string) => /\.test\.tsx?$/.test(path);
const screens = Object.entries(sources)
  .map(([key, src]) => ({ path: rel(key), src }))
  .filter(f => /^(views|layouts)\//.test(f.path) && f.path.endsWith('.tsx') && !isTestFile(f.path));

/** 직접 구현 금지 — 화면에서 보이면 왼쪽 공용 UI를 쓴다 */
const PRIMITIVES: { pattern: RegExp; use: string }[] = [
  { pattern: /\bpf-frame\b/, use: 'Frame(틀) · Panel(제목 있는 박스)' },
  { pattern: /\bpf-btn\b/, use: 'Button · LinkButton(다른 페이지 링크)' },
  { pattern: /<button\b/, use: 'Button · IconButton · PillButton · SelectList · Frame as="button"' },
  { pattern: /<input\b/, use: 'TextInput · Slider · NumberStepper' },
  { pattern: /<select\b/, use: 'Select' },
  { pattern: /<textarea\b/, use: 'TextArea' },
  { pattern: /<label\b/, use: 'Field(이름표·입력·도움말·오류 묶음)' },
  { pattern: /<table\b/, use: 'DataTable(담는 칸은 TableBox)' },
];

/** 브라우저 기본 대화상자 — 게임 화면은 useDialogs(ConfirmDialog·InputDialog·NoticeDialog)를 쓴다. 예외 없음 */
const SYSTEM_DIALOG = /\bwindow\.(?:confirm|prompt|alert)\(/;

/** 제목 태그 직접 사용 — 쪽 제목은 PageTitle, 구역은 SectionTitle, 묶음은 Subheading, 창·상자 제목은 Panel·ModalCard의
 *  title이 맡는다. 아래는 그 틀에 맞지 않는 자리라 직접 둔다(줄이기만 한다) */
const RAW_HEADING = /<h[1-6][\s>]/;
const RAW_HEADING_EXCEPTIONS = new Set([
  'views/devtools/DevTools.tsx',      // 떠 있는 창 머리 — 끌기 손잡이를 겸한다
  'views/game/tabs/region/VRegion.tsx', // 지역 탭 로어 상자 — 고정 높이 상자 안 한 줄 제목
]);

/** 화면(views·layouts)의 overflow 직접 지정 — 세로 스크롤은 공용 스크롤 방식(pf-vscroll + pf-scroll-panel)이나 TableBox가 맡는다.
 *  아래는 칸 안에서 표를 가로로 굴려야 하는 자리(관리자 표, 지역 탭 표)와 양방향 표 상자라 직접 둔다(줄이기만 한다) */
const OVERFLOW_DIRECT = /\boverflow-(?:x-|y-)?(?:auto|scroll)\b|\[overflow(?:-x|-y)?:(?:auto|scroll)\]/;
const OVERFLOW_EXCEPTIONS = new Set([
  'views/admin/tabs/AntiAbuseTab.tsx',
  'views/admin/tabs/BountyFunnelSection.tsx',
  'views/admin/tabs/ChatReportsSection.tsx',
  'views/admin/tabs/FishTab.tsx',
  'views/admin/tabs/LettersTab.tsx',
  'views/admin/tabs/MailTab.tsx',
  'views/admin/tabs/MetricsTab.tsx',
  'views/admin/tabs/ProgressionTab.tsx',
  'views/admin/tabs/UsersTab.tsx',
  'views/game/tabs/region/VRegion.tsx',
]);

/** 막대를 숨기는 스크롤(pf-scroll) — 사이드바처럼 막대가 폭을 흔들면 안 되는 자리에만 쓴다. 창 안은 막대가 보이는 pf-scroll-panel */
const HIDDEN_BAR = /(?<![\w-])pf-scroll(?![\w-])/;
const HIDDEN_BAR_EXCEPTIONS = new Set([
  'layouts/sidebar/index.tsx', // 384px 폭 사이드바 — 탭을 옮길 때 막대가 폭을 흔들지 않게 숨긴다
]);

/** 스크롤을 거는 모든 표기 — 공용 스크롤 클래스, overflow 유틸, arbitrary 표기(`[overflow-y:auto]`) */
const SCROLL_CLASS = /pf-vscroll|pf-scroll|\boverflow-(?:x-|y-)?(?:auto|scroll)\b|\[overflow(?:-x|-y)?:(?:auto|scroll)\]/;

/** `<Modal ...>` 여는 태그들. 속성 값의 `{...}` 안에 있는 `>`(화살표 함수 등)는 태그 끝으로 보지 않는다 */
function modalOpeningTags(src: string): string[] {
  const tags: string[] = [];
  for (const m of src.matchAll(/<Modal\b/g)) {
    let depth = 0;
    let i = m.index;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    tags.push(src.slice(m.index, i + 1));
  }
  return tags;
}

/** className을 넘기는 Modal 호출부 중 앱 모달(layer="app")이 아닌 것. 스테이지 모달의 투명 래퍼에는 스크롤 클래스가 들어갈 길이 없어야 해서
 *  className 자체를 받지 않는다(타입으로도 막는다). 필요한 높이는 height prop으로 고른다 */
const modalsWithClassName = (src: string) =>
  modalOpeningTags(src).filter(tag => /\bclassName\s*=/.test(tag) && !/\blayer="app"/.test(tag));

/** 막대 클래스(보이는 막대 pf-scroll-panel, 호버 막대 pf-scroll-hud, 숨김 pf-scroll) 없이 pf-vscroll만 쓰는 줄 */
const hasVscrollWithoutBar = (line: string) =>
  /pf-vscroll/.test(line) && !/pf-scroll-panel|pf-scroll-hud|(?<![\w-])pf-scroll(?![\w-])/.test(line);

/** 공용 상수(SCROLL_Y) 없이 pf-vscroll을 직접 쓰는 자리 — 세로 스크롤 칸은 공용 상수로 쓴다.
 *  관리자와 개발 도구 화면은 이 규칙을 따로 정한다 */
const VSCROLL_LITERAL_EXCEPTIONS = new Set([
  'layouts/sidebar/index.tsx',         // 막대를 숨기는 사이드바
  'views/game/base-menu/BaseMenu.tsx', // 호버 때만 막대가 보이는 HUD 스크롤(pf-scroll-hud)
  'views/game/tabs/region/VRegion.tsx', // 사이드바 탭 안의 고정 높이 칸 — 막대 자리 규칙은 창에 적용한다
]);
const isAdminOrDevtools = (path: string) => /^views\/(?:admin|devtools)\//.test(path);

/** 세로 스크롤을 거는 줄이 막대 자리(scrollbar-gutter)를 확보하지 않는 자리 */
const SCROLL_LINE = /pf-vscroll|\boverflow-(?:y-)?(?:auto|scroll)\b|\[overflow(?:-y)?:(?:auto|scroll)\]/;
const GUTTER = /\[scrollbar-gutter:stable/;
const GUTTER_EXCEPTIONS = new Set([
  'ui/Modal.tsx',          // 앱 모달 박스 — 막대 자리를 확보하지 않는다(막대가 나타나면 내용 폭이 줄어든다). 박스의 16px 안쪽 여백이 막대와 내용 사이를 띄운다
  'ui/hud/MessageLog.tsx', // 캔버스 위 글줄 상자 — 호버 때만 보이는 HUD 막대
  'layouts/sidebar/index.tsx', // 사이드바는 창이 아니며 막대를 숨긴다
  'views/game/tabs/region/VRegion.tsx', // 사이드바 탭은 창이 아니다(막대 자리 규칙은 창에 적용한다)
]);

describe('UI 시스템 가드', () => {
  it('화면은 기본 요소(틀·버튼·입력)를 직접 구현하지 않고 공용 UI를 쓴다', () => {
    const offenders: string[] = [];
    for (const { path, src } of screens) {
      src.split('\n').forEach((line, i) => {
        for (const { pattern, use } of PRIMITIVES) {
          if (pattern.test(line)) offenders.push(`${path}:${i + 1} ${pattern} → ${use}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('브라우저 기본 대화상자를 쓰지 않는다 — 확인·입력·알림은 useDialogs', () => {
    expect(appSources.filter(([, src]) => SYSTEM_DIALOG.test(src)).map(([key]) => key)).toEqual([]);
  });

  it('기능·앱 진입 코드도 입력 요소를 직접 그리지 않는다', () => {
    const raw = /<(?:input|textarea|select)/;
    expect(appSources.filter(([key, src]) => !/\/presentation\//.test(key) && raw.test(src)).map(([key]) => key)).toEqual([]);
  });

  it('제목은 제목 컴포넌트와 창·상자 title로 쓴다 — 예외 목록의 자리만 태그를 직접 쓴다', () => {
    const using = screens.filter(f => RAW_HEADING.test(f.src)).map(f => f.path);
    expect(using.filter(p => !RAW_HEADING_EXCEPTIONS.has(p))).toEqual([]);
    expect([...RAW_HEADING_EXCEPTIONS].filter(p => !using.includes(p))).toEqual([]);
  });

  it('같은 이름의 지역 컴포넌트가 두 화면 이상에 있으면 공용 UI로 올린다', () => {
    const owners = new Map<string, string[]>();
    for (const { path, src } of screens) {
      for (const m of src.matchAll(/^function ([A-Z]\w*)\s*[(<]/gm)) {
        owners.set(m[1], [...(owners.get(m[1]) ?? []), path]);
      }
    }
    const dupes = [...owners].filter(([, paths]) => paths.length > 1).map(([name, paths]) => `${name}: ${paths.join(', ')}`);
    expect(dupes).toEqual([]);
  });
  it('화면은 overflow-auto·scroll을 직접 지정하지 않는다 — 예외 목록의 자리만 쓴다', () => {
    const using = screens.filter(f => OVERFLOW_DIRECT.test(f.src)).map(f => f.path);
    expect(using.filter(p => !OVERFLOW_EXCEPTIONS.has(p))).toEqual([]);
    expect([...OVERFLOW_EXCEPTIONS].filter(p => !using.includes(p))).toEqual([]);
  });

  it('창 안 스크롤은 막대가 보인다 — 막대를 숨기는 pf-scroll은 예외 목록의 자리만 쓴다', () => {
    const using = screens.filter(f => HIDDEN_BAR.test(f.src)).map(f => f.path);
    expect(using.filter(p => !HIDDEN_BAR_EXCEPTIONS.has(p))).toEqual([]);
    expect([...HIDDEN_BAR_EXCEPTIONS].filter(p => !using.includes(p))).toEqual([]);
  });

  it('스테이지 모달의 투명 래퍼는 스크롤하지 않는다 — 스크롤은 카드 본문이 맡는다', () => {
    const modal = sources['./Modal.tsx'];
    const stageBox = /layer === 'app'[\s\S]*?\n\s*:\s*cx\(([\s\S]*?)\);/.exec(modal)?.[1];
    expect(stageBox).toBeDefined();
    expect(stageBox).not.toMatch(SCROLL_CLASS);
  });
  it('Modal 호출부는 className을 넘기지 않는다 — 앱 모달(layer="app")만 예외', () => {
    expect(screens.flatMap(f => modalsWithClassName(f.src).map(tag => `${f.path}: ${tag}`))).toEqual([]);
  });

  it('감지 함수: className을 넘기는 스테이지 Modal을 잡고, 태그 안의 화살표 함수와 앱 모달은 가린다', () => {
    expect(modalsWithClassName(`<Modal layer="stage" className={FIXED} onClose={() => {}}>`)).toHaveLength(1);
    expect(modalsWithClassName(`<Modal layer="stage" className={cx(a, SCROLL_Y)} onClose={() => go(1 > 0)}>`)).toHaveLength(1);
    expect(modalsWithClassName(`<Modal className="pf-vscroll">`)).toHaveLength(1);
    expect(modalsWithClassName(`<Modal layer="stage" height={480} onClose={() => {}}>`)).toEqual([]);
    expect(modalsWithClassName(`<Modal layer="app" onClose={() => {}} className="pf-modal-worldmap">`)).toEqual([]);
  });

  it('감지 함수: overflow 직접 지정의 arbitrary 표기도 잡는다', () => {
    for (const cls of ['overflow-auto', 'overflow-x-scroll', '[overflow-y:auto]', '[overflow:scroll]', '[overflow-x:auto]']) {
      expect(OVERFLOW_DIRECT.test(cls), cls).toBe(true);
    }
    expect(OVERFLOW_DIRECT.test('overflow-hidden')).toBe(false);
  });

  it('pf-vscroll은 막대 클래스와 함께 쓴다', () => {
    const offenders: string[] = [];
    for (const { path, src } of screens) {
      src.split('\n').forEach((line, i) => { if (hasVscrollWithoutBar(line)) offenders.push(`${path}:${i + 1}`); });
    }
    expect(offenders).toEqual([]);
  });

  it('감지 함수: 막대 클래스 없는 pf-vscroll만 잡는다', () => {
    expect(hasVscrollWithoutBar('<div className="pf-vscroll flex-1">')).toBe(true);
    expect(hasVscrollWithoutBar('<div className="pf-vscroll pf-scroll-panel">')).toBe(false);
    expect(hasVscrollWithoutBar('<div className="pf-vscroll pf-scroll-hud">')).toBe(false);
    expect(hasVscrollWithoutBar('<div className="pf-scroll pf-vscroll">')).toBe(false);
  });

  it('화면의 세로 스크롤 칸은 공용 상수(SCROLL_Y)를 쓴다 — pf-vscroll 직접 지정은 예외 목록의 자리만', () => {
    const using = screens.filter(f => !isAdminOrDevtools(f.path) && /pf-vscroll/.test(f.src)).map(f => f.path);
    expect(using.filter(p => !VSCROLL_LITERAL_EXCEPTIONS.has(p))).toEqual([]);
    expect([...VSCROLL_LITERAL_EXCEPTIONS].filter(p => !using.includes(p))).toEqual([]);
  });

  it('공용 상수는 막대 자리, 내용 여백, 포커스 윤곽 여백을 함께 준다', () => {
    for (const cls of ['pf-vscroll', 'pf-scroll-panel', '[scrollbar-gutter:stable]', 'pr-2', '-ml-1', 'pl-1', '-mt-1', 'pt-1', '-mb-1', 'pb-1']) {
      expect(SCROLL_Y.split(' '), cls).toContain(cls);
    }
  });

  it('세로로 스크롤하는 칸은 막대 자리를 늘 확보한다 — scrollbar-gutter 없는 줄은 예외 목록의 자리만', () => {
    const offenders: string[] = [];
    const targets = Object.entries(sources)
      .map(([key, src]) => ({ path: rel(key), src }))
      .filter(f => /^(views|layouts|ui)\//.test(f.path) && f.path.endsWith('.tsx') && !isTestFile(f.path)
        && !isAdminOrDevtools(f.path) && !GUTTER_EXCEPTIONS.has(f.path));
    for (const { path, src } of targets) {
      src.split('\n').forEach((line, i) => {
        if (SCROLL_LINE.test(line) && !GUTTER.test(line)) offenders.push(`${path}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
