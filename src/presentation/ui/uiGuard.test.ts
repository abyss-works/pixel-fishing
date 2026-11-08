// UI 시스템 가드 — 화면(views·layouts)이 공용 UI(ui)를 조합하고, 기본 요소를 직접 구현하지 않게 한다.
// 한 번만 쓰는 화면 조각은 그 화면 파일 안의 지역 컴포넌트로 만들 수 있다. 단 두 화면 이상에 같은 이름의
// 지역 컴포넌트가 생기면 공용 UI로 올려야 한다. 예외 목록은 줄이기만 한다(새 예외를 더하지 않는다).
import { createElement } from 'react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Modal from './Modal';
import type { ModalHeight } from './Modal';
import { SCROLL_Y, SCROLL_Y_ROWS } from './scrollArea';

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
/** 화면(views·layouts)의 모든 소스 — 클래스 상수를 담은 .ts 파일도 포함한다. 스크롤 규칙 검사는 이 목록으로 한다 */
const screenFiles = Object.entries(sources)
  .map(([key, src]) => ({ path: rel(key), src }))
  .filter(f => /^(views|layouts)\//.test(f.path) && !isTestFile(f.path));
/** 화면 중 마크업을 가진 .tsx. 기본 요소 직접 구현 같은 마크업 규칙 검사는 이 목록으로 한다 */
const screens = screenFiles.filter(f => f.path.endsWith('.tsx'));

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
const OVERFLOW_DIRECT = /\boverflow-(?:x-|y-)?(?:auto|scroll)\b|\[overflow(?:-x|-y)?:(?:auto|scroll)\]|\boverflow(?:X|Y)?\s*:\s*['"`](?:auto|scroll)['"`]/;
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

/** 스크롤을 거는 모든 표기 — 공용 스크롤 클래스, overflow 유틸, arbitrary 표기(`[overflow-y:auto]`), 인라인 style 객체 */
const SCROLL_CLASS = new RegExp(`pf-vscroll|pf-scroll|${OVERFLOW_DIRECT.source}`);

/** `<이름 ...>` 여는 태그들. 속성 값의 `{...}` 안에 있는 `>`(화살표 함수 등)는 태그 끝으로 보지 않는다 */
function openingTags(src: string, name: string): string[] {
  const tags: string[] = [];
  for (const m of src.matchAll(new RegExp(`<${name}\\b`, 'g'))) {
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

/** 여는 태그 자신의 className 속성이 있는가. 속성 값의 `{...}` 안(footer로 넘기는 요소의 className 등)은 보지 않는다 */
function hasOwnClassName(tag: string): boolean {
  let depth = 0;
  let own = '';
  for (const c of tag) {
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0) own += c;
  }
  return /\bclassName\s*=/.test(own);
}

/** className을 넘기는 Modal 호출부 중 앱 모달(layer="app")이 아닌 것. 스테이지 모달의 투명 래퍼에는 스크롤 클래스가 들어갈 길이 없어야 해서
 *  className 자체를 받지 않는다(타입으로도 막는다). 필요한 높이는 height prop으로 고른다 */
const modalsWithClassName = (src: string) =>
  openingTags(src, 'Modal').filter(tag => hasOwnClassName(tag) && !/\blayer="app"/.test(tag));

/** className을 넘기는 ModalCard 호출부. 카드는 className을 받지 않아(스크롤 클래스가 카드에 걸리는 길을 막는다) 변형은 명시 prop으로 고른다 */
const cardsWithClassName = (src: string) => openingTags(src, 'ModalCard').filter(hasOwnClassName);

/** 줄 수로 높이를 정하는 칸(h, max-h)에 높이가 정해지지 않은 칸용 상수(SCROLL_Y)를 쓴 줄 — 줄 수로 정하는 칸은 SCROLL_Y_ROWS를 쓴다 */
/** 앱 모달(layer="stage"가 아닌 Modal)의 첫 자식이 제목 요소(header, PageTitle)인 호출부 — 제목은 title이나 header prop으로 넘겨 스크롤 칸 밖에 둔다 */
const appModalsWithTitleChild = (src: string) =>
  openingTags(src, 'Modal')
    .filter(tag => !/\blayer="stage"/.test(tag))
    .filter(tag => /^\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<(?:header|PageTitle)\b/.test(src.slice(src.indexOf(tag) + tag.length)));

const sizedWithFlexibleScroll = (line: string) => /\$\{SCROLL_Y\}/.test(line) && /(?<![\w-])(?:max-)?h-\[/.test(line);

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

  it('로어 문단은 LoreParagraph로 그린다 - 첫 글자 강조(first-letter)는 그 컴포넌트만 정한다', () => {
    const LORE_VIEWS = ['views/game/tabs/dex/DexDetail.tsx', 'views/game/tabs/dex/NamedDetail.tsx'];
    const src = (path: string) => screens.find(f => f.path === path)?.src ?? '';
    for (const path of LORE_VIEWS) {
      expect(src(path), path).toMatch(/<LoreParagraph\b/);
      expect(src(path), path).not.toMatch(/<p\b[^>]*>\s*\{[^}]*(?:\.lore|chronicle)/);
    }
    expect(screens.filter(f => /first-letter:/.test(f.src)).map(f => f.path)).toEqual([]);
  });
  it('화면은 overflow-auto·scroll을 직접 지정하지 않는다 — 예외 목록의 자리만 쓴다', () => {
    const using = screenFiles.filter(f => OVERFLOW_DIRECT.test(f.src)).map(f => f.path);
    expect(using.filter(p => !OVERFLOW_EXCEPTIONS.has(p))).toEqual([]);
    expect([...OVERFLOW_EXCEPTIONS].filter(p => !using.includes(p))).toEqual([]);
  });

  it('창 안 스크롤은 막대가 보인다 — 막대를 숨기는 pf-scroll은 예외 목록의 자리만 쓴다', () => {
    const using = screenFiles.filter(f => HIDDEN_BAR.test(f.src)).map(f => f.path);
    expect(using.filter(p => !HIDDEN_BAR_EXCEPTIONS.has(p))).toEqual([]);
    expect([...HIDDEN_BAR_EXCEPTIONS].filter(p => !using.includes(p))).toEqual([]);
  });

  describe('스테이지 모달 래퍼', () => {
    afterEach(cleanup);
    // 래퍼에 합쳐지는 클래스(높이 상수 포함)를 정규식으로 읽지 않고, 높이·폭 변형을 모두 렌더해 실제 class를 본다
    const heights: (ModalHeight | undefined)[] = [undefined, 400, 480, 520, 560];
    const widths = [{}, { md: true }, { xl: true }];
    it('모든 높이·폭 변형에서 스크롤 클래스를 갖지 않는다 — 스크롤은 카드 본문이 맡는다', () => {
      const classes: string[] = [];
      for (const height of heights) {
        for (const width of widths) {
          const props: ComponentProps<typeof Modal> = { layer: 'stage', height, onClose: () => {}, children: createElement('p', null, '내용'), ...width };
          render(createElement(Modal, props));
          classes.push(screen.getByRole('dialog').className);
          cleanup();
        }
      }
      expect(classes).toHaveLength(heights.length * widths.length);
      expect(classes.filter(c => SCROLL_CLASS.test(c))).toEqual([]);
    });
    it('감지: 높이 상수에 스크롤 클래스가 섞이면 잡는다', () => {
      expect(SCROLL_CLASS.test('h-[min(480px,calc(100%-32px))] overflow-y-auto')).toBe(true);
      expect(SCROLL_CLASS.test('h-[min(480px,calc(100%-32px))] pf-vscroll')).toBe(true);
      expect(SCROLL_CLASS.test('h-[min(480px,calc(100%-32px))] mobile:h-auto')).toBe(false);
    });
  });
  it('앱 모달의 제목 요소는 본문 자식이 아니라 title이나 header prop이다 — 제목이 본문과 함께 스크롤하지 않는다', () => {
    expect(screens.flatMap(f => appModalsWithTitleChild(f.src).map(tag => `${f.path}: ${tag}`))).toEqual([]);
    expect(appModalsWithTitleChild(`<Modal xl onClose={c}>\n  {/* 설명 */}\n  <header className="a">`)).toHaveLength(1);
    expect(appModalsWithTitleChild(`<Modal onClose={c}><PageTitle>가</PageTitle>`)).toHaveLength(1);
    expect(appModalsWithTitleChild(`<Modal xl onClose={c} header={<header>가</header>}><p>본문</p>`)).toEqual([]);
    expect(appModalsWithTitleChild(`<Modal layer="stage" onClose={c}><header>가</header>`)).toEqual([]);
  });
  it('앱 모달 안에는 크기를 정하지 않은 스크롤 칸(SCROLL_Y)을 겹치지 않는다 — 본문 한 칸만 스크롤한다', () => {
    const nested = (src: string) => openingTags(src, 'Modal').some(tag => !/\blayer="stage"/.test(tag)) && /\$\{SCROLL_Y\}/.test(src);
    expect(screens.filter(f => nested(f.src)).map(f => f.path)).toEqual([]);
    expect(nested('<Modal onClose={c}><div className={`${SCROLL_Y} flex-1`}>')).toBe(true);
    expect(nested('<Modal layer="stage" onClose={c}><div className={`${SCROLL_Y} flex-1`}>')).toBe(false);
    expect(nested('<Modal onClose={c}><div className={`${SCROLL_Y_ROWS} max-h-[9px]`}>')).toBe(false);
  });
  it('ModalCard 호출부는 className을 넘기지 않는다 — 변형은 명시 prop으로 고른다', () => {
    expect(screens.flatMap(f => cardsWithClassName(f.src).map(tag => `${f.path}: ${tag}`))).toEqual([]);
    expect(cardsWithClassName(`<ModalCard title="가" className="overflow-auto">`)).toHaveLength(1);
    expect(cardsWithClassName(`<ModalCard title="가" centered onClose={() => go(1 > 0)}>`)).toEqual([]);
  });
  it('화면은 인라인 style 객체로도 overflow 스크롤을 걸지 않는다', () => {
    for (const code of [`style={{ overflow: 'auto' }}`, `{ overflowY: "scroll" }`, 'const s = { overflowX: `auto` }']) {
      expect(OVERFLOW_DIRECT.test(code), code).toBe(true);
    }
    expect(OVERFLOW_DIRECT.test(`style={{ overflow: 'hidden' }}`)).toBe(false);
  });
  it('줄 수로 높이를 정하는 칸은 SCROLL_Y_ROWS를 쓴다 — 높이를 정한 줄에 SCROLL_Y를 쓰지 않는다', () => {
    const offenders: string[] = [];
    for (const { path, src } of screenFiles) {
      src.split('\n').forEach((line, i) => { if (sizedWithFlexibleScroll(line)) offenders.push(`${path}:${i + 1}`); });
    }
    expect(offenders).toEqual([]);
    expect(sizedWithFlexibleScroll('<div className={`${SCROLL_Y} max-h-[186px]`}>')).toBe(true);
    expect(sizedWithFlexibleScroll('<div className={`${SCROLL_Y_ROWS} max-h-[186px]`}>')).toBe(false);
    expect(sizedWithFlexibleScroll('<div className={`${SCROLL_Y} min-h-0 flex-1`}>')).toBe(false);
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
    for (const { path, src } of screenFiles) {
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
    const using = screenFiles.filter(f => !isAdminOrDevtools(f.path) && /pf-vscroll/.test(f.src)).map(f => f.path);
    expect(using.filter(p => !VSCROLL_LITERAL_EXCEPTIONS.has(p))).toEqual([]);
    expect([...VSCROLL_LITERAL_EXCEPTIONS].filter(p => !using.includes(p))).toEqual([]);
  });

  it('공용 상수는 막대 자리, 내용 여백, 포커스 윤곽 여백을 함께 준다', () => {
    for (const cls of ['pf-vscroll', 'pf-scroll-panel', '[scrollbar-gutter:stable]', 'pr-2', '-ml-1', 'pl-1', '-mt-1', 'pt-1', '-mb-1', 'pb-1']) {
      expect(SCROLL_Y.split(' '), cls).toContain(cls);
    }
  });

  it('줄 수로 높이를 정하는 칸의 상수(SCROLL_Y_ROWS)는 아래쪽 바깥 여백으로 칸을 늘리지 않는다', () => {
    const cls = SCROLL_Y_ROWS.split(' ');
    for (const c of ['pf-vscroll', 'pf-scroll-panel', '[scrollbar-gutter:stable]', 'pr-2', '-mt-1', 'pt-1', 'pb-1']) expect(cls, c).toContain(c);
    expect(cls).not.toContain('-mb-1');
    expect(SCROLL_Y.split(' ')).toContain('-mb-1');
  });

  it('세로로 스크롤하는 칸은 막대 자리를 늘 확보한다 — scrollbar-gutter 없는 줄은 예외 목록의 자리만', () => {
    const offenders: string[] = [];
    const targets = Object.entries(sources)
      .map(([key, src]) => ({ path: rel(key), src }))
      .filter(f => /^(views|layouts|ui)\//.test(f.path) && !isTestFile(f.path)
        && !isAdminOrDevtools(f.path) && !GUTTER_EXCEPTIONS.has(f.path));
    for (const { path, src } of targets) {
      src.split('\n').forEach((line, i) => {
        if (SCROLL_LINE.test(line) && !GUTTER.test(line)) offenders.push(`${path}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
