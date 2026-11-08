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
  'views/admin/tabs/LiveTab.tsx',
  'views/admin/tabs/MailTab.tsx',
  'views/admin/tabs/MetricsTab.tsx',
  'views/admin/tabs/OpsTab.tsx',
  'views/admin/tabs/OverviewTab.tsx',
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
  return openingTagsAt(src, name).map(t => t.tag);
}
/** 여는 태그와 그 끝 위치. name은 정규식 조각이다 */
function openingTagsAt(src: string, name: string): { tag: string; end: number }[] {
  const tags: { tag: string; end: number }[] = [];
  for (const m of src.matchAll(new RegExp(`<${name}\\b`, 'g'))) {
    let depth = 0;
    let i = m.index;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    tags.push({ tag: src.slice(m.index, i + 1), end: i + 1 });
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

/** 여는 태그 뒤부터 짝이 되는 닫는 태그 앞까지의 본문(같은 이름이 겹쳐 쓰이지 않는다고 본다) */
const childrenOf = (src: string, { end }: { end: number }, name: string) => {
  const close = src.indexOf(`</${name}>`, end);
  return src.slice(end, close < 0 ? undefined : close);
};
const ANY_TAG = '[A-Za-z][\\w.]*';

/** 앱 모달(layer="stage"가 아닌 Modal)의 본문에 제목 요소(header, PageTitle)가 있는 호출부. 다른 요소로 감싸도 잡는다.
 *  제목은 title이나 header prop으로 넘겨 스크롤 칸 밖에 둔다 */
const appModalsWithTitleChild = (src: string) =>
  openingTagsAt(src, 'Modal')
    .filter(t => !/\blayer="stage"/.test(t.tag))
    .filter(t => /<(?:header|PageTitle)\b/.test(childrenOf(src, t, 'Modal')))
    .map(t => t.tag);

/** 높이를 정하는 클래스(h-[..], h-24, h-full, max-h-.. 등). min-h와 flex-1은 높이를 정하지 않는다 */
const HEIGHT_CLASS_RE = /(?<![\w-])(?:max-)?h-(?:\[|\d|px|full|screen|dvh|svh|lh|min|max|fit)/;

/** 줄 수로 높이를 정한 칸에 높이를 정하지 않은 칸용 상수(SCROLL_Y)를 쓴 태그 — 줄 수로 정하는 칸은 SCROLL_Y_ROWS를 쓴다.
 *  태그가 여러 줄이어도, 대괄호 없는 높이 클래스여도 잡는다 */
const sizedWithFlexibleScroll = (src: string) =>
  openingTags(src, ANY_TAG).filter(tag => /\$\{SCROLL_Y\}/.test(tag) && HEIGHT_CLASS_RE.test(tag));
/** 줄 수가 아니라 화면 높이 같은 여유 상한(max-h)만 두는 칸 — 내용이 낮으면 내용 높이로 커지므로 SCROLL_Y를 쓴다(줄이기만 한다) */
const SAFETY_CAP_EXCEPTIONS = new Set([
  'views/overlays/facility/FacilityModal.tsx',   // 판매 목록: 행 서른 개 상한
  'views/overlays/whats-new/NewsStep.tsx',       // 소식 목록: 화면 높이 42% 상한
]);

/** 스크롤 칸으로 보는 태그: 공용 상수, TableBox, pf-vscroll */
const SCROLL_CELL_RE = /\$\{SCROLL_Y\}|^<TableBox\b|pf-vscroll/;

/** 스크롤 칸을 본문에 겹쳐 둔 태그. 본문이 스크롤하는 창(앱 모달, 높이를 고정하지 않은 ModalCard)의 본문 안에
 *  높이를 정하지 않은 스크롤 칸(flex-1, 높이 없음)이 있으면 스크롤이 겹친다. 높이를 정한 칸(줄 수 고정 칸)은 줄어드는 쪽이 먼저라 허용한다 */
const nestedScrollCells = (src: string) => {
  const hosts = [
    ...openingTagsAt(src, 'Modal').filter(t => !/\blayer="stage"/.test(t.tag) && !/\bbare\b/.test(t.tag)).map(t => ({ ...t, name: 'Modal' })),
    ...openingTagsAt(src, 'ModalCard').filter(t => !/\bfixed\b/.test(t.tag)).map(t => ({ ...t, name: 'ModalCard' })),
  ];
  return hosts.flatMap(h => openingTags(childrenOf(src, h, h.name), ANY_TAG)
    .filter(tag => SCROLL_CELL_RE.test(tag) && !/SCROLL_Y_ROWS/.test(tag) && !HEIGHT_CLASS_RE.test(tag)));
};

/** 본문이 스크롤하는 ModalCard(fixed가 아닌 카드)의 본문 안에 있는 주 버튼(variant="primary", ConfirmButton) — 확정 버튼은 confirm 자리에 둔다.
 *  높이를 고정한 카드(fixed)는 본문이 스크롤하지 않고 탭 안의 동작 줄이 고정 영역에 있어 대상이 아니다 */
const PRIMARY_BUTTON = /variant="primary"|^<ConfirmButton/;
const primaryButtons = (body: string) => openingTags(body, '(?:Button|ConfirmButton)').filter(tag => PRIMARY_BUTTON.test(tag));
/** 앱 모달(layer="stage"가 아닌 Modal)의 본문(children) 안 주 버튼. footer prop 안의 버튼은 본문이 아니다. bare 모달은 안의 ModalCard가 검사한다 */
const primaryInAppModalBody = (src: string) =>
  openingTagsAt(src, 'Modal').filter(t => !/\blayer="stage"/.test(t.tag) && !/\bbare\b/.test(t.tag))
    .flatMap(t => primaryButtons(childrenOf(src, t, 'Modal')));
const primaryInCardBody = (src: string) =>
  openingTagsAt(src, 'ModalCard').filter(t => !/\bfixed\b/.test(t.tag)).flatMap(t => primaryButtons(childrenOf(src, t, 'ModalCard')))
    .concat(primaryInAppModalBody(src));
/** 창 안에서 확정 버튼을 그리는 공용 요약(GuildInviteSummary)은 ModalCard를 가진 창에서 actionSlot으로 버튼을 내보내거나 버튼이 없는 요약(view={null})이어야 한다 */
const summaryWithInlineAction = (src: string) =>
  /<ModalCard\b/.test(src) ? openingTags(src, 'GuildInviteSummary').filter(tag => !/\bactionSlot\b|view=\{null\}/.test(tag)) : [];
/** 높이를 정한 상자(Inset h-[..]) 안을 채우는 본문 칸 — 상자가 줄어들면 칸도 따라 줄어든다(줄이기만 한다) */
const NESTED_SCROLL_EXCEPTIONS = new Set([
  'views/overlays/mailbox/MailboxModal.tsx', // 우편 본문 칸 — 190px 상세 상자 안
]);
const PRIMARY_IN_BODY_EXCEPTIONS = new Set([
  'views/overlays/mailbox/MailboxModal.tsx', // 받기: 선택한 우편 상세 안의 동작이다. 창 전체의 확정이 아니다
  'views/overlays/account/AccountModal.tsx', // 이메일로 계속: 로그인 폼의 제출 버튼이다. 본문 폼의 동작이다
]);

/** 막대 클래스(보이는 막대 pf-scroll-panel, 호버 막대 pf-scroll-hud, 숨김 pf-scroll) 없이 pf-vscroll만 쓰는 줄 */
const hasVscrollWithoutBar = (line: string) =>
  /pf-vscroll/.test(line) && !/pf-scroll-panel|pf-scroll-hud|(?<![\w-])pf-scroll(?![\w-])/.test(line);

/** 공용 상수(SCROLL_Y) 없이 pf-vscroll을 직접 쓰는 자리 — 세로 스크롤 칸은 공용 상수로 쓴다.
 *  관리자와 개발 도구 화면은 이 규칙을 따로 정한다 */
const VSCROLL_LITERAL_EXCEPTIONS = new Set([
  'layouts/sidebar/index.tsx',         // 막대를 숨기는 사이드바
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
    const raw = /<(?:input|textarea|select)b/;
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
  it('앱 모달의 제목 요소는 본문 자식이 아니라 title이나 header prop이다 — 감싼 제목도 잡는다', () => {
    expect(screens.flatMap(f => appModalsWithTitleChild(f.src).map(tag => `${f.path}: ${tag}`))).toEqual([]);
    expect(appModalsWithTitleChild(`<Modal xl onClose={c}>\n  {/* 설명 */}\n  <header className="a">가</header></Modal>`)).toHaveLength(1);
    expect(appModalsWithTitleChild(`<Modal onClose={c}><div className="a"><PageTitle>가</PageTitle></div></Modal>`)).toHaveLength(1);
    expect(appModalsWithTitleChild(`<Modal xl onClose={c} header={<header>가</header>}><p>본문</p></Modal>`)).toEqual([]);
    expect(appModalsWithTitleChild(`<Modal layer="stage" onClose={c}><header>가</header></Modal>`)).toEqual([]);
  });
  it('본문이 스크롤하는 창 안에는 높이를 정하지 않은 스크롤 칸을 겹치지 않는다 — 앱 모달과 높이를 고정하지 않은 ModalCard', () => {
    expect(screens.filter(f => !NESTED_SCROLL_EXCEPTIONS.has(f.path)).flatMap(f => nestedScrollCells(f.src).map(tag => `${f.path}: ${tag}`))).toEqual([]);
    expect([...NESTED_SCROLL_EXCEPTIONS].filter(p => nestedScrollCells(screens.find(f => f.path === p)?.src ?? '').length === 0)).toEqual([]);
    const cell = '<div className={`${SCROLL_Y} flex-1`}>';
    expect(nestedScrollCells(`<Modal onClose={c}>${cell}</div></Modal>`)).toHaveLength(1);
    expect(nestedScrollCells(`<ModalCard title="가">${cell}</div></ModalCard>`)).toHaveLength(1);
    expect(nestedScrollCells(`<ModalCard title="가"><TableBox className="flex-1 min-h-0">x</TableBox></ModalCard>`)).toHaveLength(1);
    expect(nestedScrollCells(`<ModalCard title="가" fixed>${cell}</div></ModalCard>`)).toEqual([]);
    expect(nestedScrollCells(`<Modal layer="stage" onClose={c}>${cell}</div></Modal>`)).toEqual([]);
    expect(nestedScrollCells(`<ModalCard title="가"><TableBox className="h-[138px] shrink">x</TableBox></ModalCard>`)).toEqual([]);
    expect(nestedScrollCells('<Modal onClose={c}><div className={`${SCROLL_Y_ROWS} max-h-[9px]`}></div></Modal>')).toEqual([]);
  });
  it('확정 버튼은 ModalCard의 confirm 자리에 둔다 — 본문 안의 primary 버튼은 예외 목록의 자리만', () => {
    const using = screens.filter(f => primaryInCardBody(f.src).length > 0).map(f => f.path);
    expect(using.filter(p => !PRIMARY_IN_BODY_EXCEPTIONS.has(p))).toEqual([]);
    expect([...PRIMARY_IN_BODY_EXCEPTIONS].filter(p => !using.includes(p))).toEqual([]);
    expect(primaryInCardBody(`<ModalCard title="가" confirm={<Button variant="primary">확</Button>}><p>본문</p></ModalCard>`)).toEqual([]);
    expect(primaryInCardBody(`<ModalCard title="가"><Button variant="primary" full>확</Button></ModalCard>`)).toHaveLength(1);
    expect(primaryInCardBody(`<ModalCard title="가"><ConfirmButton reason={null}>확</ConfirmButton></ModalCard>`)).toHaveLength(1);
    expect(primaryInCardBody(`<Modal title="가" onClose={c}><p>본문</p><Button variant="primary" full>확</Button></Modal>`)).toHaveLength(1);
    expect(primaryInCardBody(`<Modal title="가" onClose={c} footer={<Button variant="primary">확</Button>}><p>본문</p></Modal>`)).toEqual([]);
    expect(primaryInCardBody(`<Modal layer="stage" onClose={c}><Button variant="primary">확</Button></Modal>`)).toEqual([]);
  });
  it('초대 창은 GuildInviteSummary의 확정 버튼을 actionSlot으로 카드 confirm 자리에 내보낸다', () => {
    expect(screens.filter(f => summaryWithInlineAction(f.src).length > 0).map(f => f.path)).toEqual([]);
    expect(summaryWithInlineAction(`<ModalCard title="가"><GuildInviteSummary preview={p} view={v} busy onConfirm={f} /></ModalCard>`)).toHaveLength(1);
    expect(summaryWithInlineAction(`<ModalCard title="가"><GuildInviteSummary preview={p} view={v} busy onConfirm={f} actionSlot /></ModalCard>`)).toEqual([]);
    expect(summaryWithInlineAction(`<GuildInviteSummary preview={p} view={v} busy onConfirm={f} />`)).toEqual([]);
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
    expect(screenFiles.filter(f => !SAFETY_CAP_EXCEPTIONS.has(f.path)).flatMap(f => sizedWithFlexibleScroll(f.src).map(tag => `${f.path}: ${tag}`))).toEqual([]);
    expect([...SAFETY_CAP_EXCEPTIONS].filter(p => sizedWithFlexibleScroll(screenFiles.find(f => f.path === p)?.src ?? '').length === 0)).toEqual([]);
    expect(sizedWithFlexibleScroll('<div className={`${SCROLL_Y} max-h-[186px]`}>')).toHaveLength(1);
    expect(sizedWithFlexibleScroll('<div className={`${SCROLL_Y} max-h-48`}>')).toHaveLength(1);
    expect(sizedWithFlexibleScroll('<div\n  className={cx(\n    `${SCROLL_Y}`,\n    "h-24",\n  )}>')).toHaveLength(1);
    expect(sizedWithFlexibleScroll('<div className={`${SCROLL_Y_ROWS} max-h-[186px]`}>')).toEqual([]);
    expect(sizedWithFlexibleScroll('<div className={`${SCROLL_Y} min-h-0 flex-1`}>')).toEqual([]);
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

  it('줄 수로 높이를 정하는 칸의 상수(SCROLL_Y_ROWS)는 아래 여백을 두되 바깥 여백으로 되돌리지 않는다', () => {
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

  // 보정 금액 — 보정이 붙는 금액(Stat)은 AdjustedAmount로만 보인다
  const ADJUSTED_SCREENS = [
    'views/game/tabs/dex/NamedDetail.tsx',
    'views/overlays/bounty/NamedCard.tsx',
    'views/overlays/bounty/QuestInfoCards.tsx',
    'views/overlays/facility/FacilityModal.tsx',
  ];
  /** 보정 금액을 .value로 꺼내 쓰는 자리 — 실제로 받은 금액을 알리는 메시지만 허용한다 */
  const ADJUSTED_VALUE_EXCEPTIONS = new Set(['views/overlays/bounty/BountyPanel.tsx']);

  it('보정이 붙는 금액을 쓰는 화면은 AdjustedAmount로 그린다', () => {
    const missing = ADJUSTED_SCREENS.filter(path => {
      const file = screens.find(f => f.path === path);
      return !file || !/<AdjustedAmount\b/.test(file.src);
    });
    expect(missing).toEqual([]);
  });

  it('화면은 보정 금액의 value·base를 꺼내 금액 표기에 직접 쓰지 않는다 — 예외 목록의 자리만', () => {
    const offenders = screens
      .filter(f => /fmtGold\([^()]*\.(value|base)\b/.test(f.src) && !ADJUSTED_VALUE_EXCEPTIONS.has(f.path))
      .map(f => f.path);
    expect(offenders).toEqual([]);
    const using = screens.filter(f => ADJUSTED_VALUE_EXCEPTIONS.has(f.path) && /fmtGold\([^()]*\.(value|base)\b/.test(f.src)).map(f => f.path);
    expect([...ADJUSTED_VALUE_EXCEPTIONS].filter(p => !using.includes(p))).toEqual([]);
  });

  it('화면은 취소선으로 금액을 직접 그리지 않는다 — 정가·보정 금액의 취소선은 PriceTag와 AdjustedAmount만 정한다', () => {
    expect(screens.filter(f => /<s[\s>]|line-through/.test(f.src)).map(f => f.path)).toEqual([]);
  });
});
