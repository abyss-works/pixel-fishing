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
  'views/overlays/whats-new/NewsStep.tsx',       // 소식 목록: 버전 하나는 화면 높이 42%, 여러 버전은 56% 상한
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
    const raw = /<(?:input|textarea|select)\b/;
    expect(appSources.filter(([key, src]) => key.startsWith('../../') && raw.test(src)).map(([key]) => key)).toEqual([]);
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

  // 보정 금액 — 보정이 붙는 금액(Stat)은 AdjustedAmount로만 보인다. 검사 범위는 presentation 전체(ui 포함)다
  const presentationFiles = Object.entries(sources)
    .map(([key, src]) => ({ path: rel(key), src }))
    .filter(f => !isTestFile(f.path));
  /** 금액 표기를 정의하는 공용 UI - 아래 직접 표기 검사에서 뺀다 */
  const AMOUNT_DEFINERS = new Set(['ui/AdjustedAmount.tsx', 'ui/PriceTag.tsx']);
  const checked = presentationFiles.filter(f => !AMOUNT_DEFINERS.has(f.path));
  const ADJUSTED_SCREENS = [
    'views/game/tabs/dex/NamedDetail.tsx',
    'views/overlays/bounty/NamedCard.tsx',
    'views/overlays/bounty/QuestInfoCards.tsx',
    'views/overlays/facility/FacilityModal.tsx',
    'views/game/tabs/bag/BagTab.tsx',
  ];
  /** 허용 줄 - 파일마다 허용하는 줄의 모양과 사유. 파일 단위가 아니라 줄 단위로 가리고, 쓰이지 않는 허용은 지운다 */
  type Allowed = Map<string, { line: RegExp; why: string }[]>;
  const VALUE_IN_GOLD = /fmtGold\([^()]*\.(?:value|base)\b/;
  const VALUE_ALLOWED: Allowed = new Map([
    ['views/overlays/bounty/BountyPanel.tsx', [
      { line: /fmtGold\(reward\.value\)/, why: '네임드 토벌 보상 수령 메시지는 실제로 받은 금액(보정 합계)을 알린다' },
    ]],
    ['views/overlays/away/awayText.ts', [
      { line: /fmtGold\(s\.released\.value\)/, why: '방치 결과의 놓아준 가치 합은 보정이 없는 숫자 필드다' },
    ]],
  ]);
  const RAW_REWARD_IN_GOLD = /fmtGold\([^()]*\breward\b(?!\.(?:value|base)\b)/;
  const RAW_REWARD_ALLOWED: Allowed = new Map([
    ['views/overlays/bounty/BountyCard.tsx', [
      { line: /fmtGold\(quest\.reward\)/, why: '일반 의뢰 카드는 보정이 없는 원본 보상이다' },
    ]],
    ['views/overlays/bounty/BountyPanel.tsx', [
      { line: /fmtGold\(q\.reward\)/, why: '일반 의뢰 완료 메시지는 보정이 없는 원본 보상이다' },
    ]],
    ['views/overlays/bounty/QuestInfoCards.tsx', [
      { line: /fmtGold\(info\.reward\)/, why: '일반 의뢰 카드는 보정이 없는 원본 보상이다' },
    ]],
  ]);
  /** 판매 합계·판매 가능 금액 이름을 그대로 금액 표기에 넘기는 모양 */
  const SALE_TOTAL_IN_GOLD = /fmtGold\(\s*(?:preview\.)?(?:total|sellable|sellableValue)\s*\)/;
  /** 패턴에 걸리는 줄 중 허용 줄이 아닌 것(경로:줄)과, 한 번도 쓰이지 않은 허용(경로) */
  const offendingLines = (files: { path: string; src: string }[], pattern: RegExp, allowed: Allowed) => {
    const offenders: string[] = [];
    const used = new Set<string>();
    for (const f of files) {
      f.src.split('\n').forEach((line, i) => {
        if (!pattern.test(line)) return;
        const rule = allowed.get(f.path)?.find(r => r.line.test(line));
        if (rule) used.add(`${f.path} ${rule.line}`); else offenders.push(`${f.path}:${i + 1}`);
      });
    }
    const stale = [...allowed].flatMap(([path, rules]) => rules.map(r => `${path} ${r.line}`)).filter(k => !used.has(k));
    return { offenders, stale };
  };
  /**
   * 버튼과 버튼 계열 컴포넌트(`<button>`, `Button`, `*Button`, `as="button"`인 `Frame`) 안에서 inButton 없이 쓴 AdjustedAmount.
   * inButton={false}는 통과시키지 않는다.
   * 한계: 같은 블록 안에 `<AdjustedAmount` 태그가 직접 적힌 경우만 잡는다. 금액 요소를 변수나 prop으로 만들어 버튼에 넘기는 경우,
   * 같은 이름의 여는 태그가 겹쳐 중첩된 호출(가장 가까운 닫는 태그에서 끊긴다), `as="button"` 앞에 `=>`가 든 속성이 오는 Frame은 잡지 못한다.
   * 검사 범위를 .ts까지 넓혀 금액 표기 검사가 문자열 조립 파일(방치 결과 문구)에도 닿으므로, 그 줄은 허용 줄 목록에 사유와 함께 둔다.
   */
  const adjustedInButtonWithoutFlag = (src: string): string[] => {
    const out: string[] = [];
    const blocks = [
      ...src.matchAll(/<(button|(?:[A-Z]\w*)?Button)\b[\s\S]*?<\/\1>/g),
      ...src.matchAll(/<((?:[A-Z]\w*)?Frame)\b(?=[^>]*\bas=["']button["'])[\s\S]*?<\/\1>/g),
    ];
    for (const block of blocks) {
      for (const tag of block[0].matchAll(/<AdjustedAmount\b[^>]*>/g)) {
        if (!/\binButton\b(?!\s*=\s*\{\s*false\s*\})/.test(tag[0])) out.push(tag[0]);
      }
    }
    return out;
  };

  it('보정이 붙는 금액을 쓰는 화면은 AdjustedAmount로 그린다', () => {
    const missing = ADJUSTED_SCREENS.filter(path => {
      const file = presentationFiles.find(f => f.path === path);
      return !file || !/<AdjustedAmount\b/.test(file.src);
    });
    expect(missing).toEqual([]);
  });

  it('금액 표기에 .value·.base를 꺼내 쓰지 않는다 - 허용 줄만', () => {
    expect(offendingLines(checked, VALUE_IN_GOLD, VALUE_ALLOWED)).toEqual({ offenders: [], stale: [] });
  });

  it('원본 보상(reward)을 금액 표기에 직접 쓰지 않는다 - 보정이 없는 일반 의뢰 줄만', () => {
    expect(offendingLines(checked, RAW_REWARD_IN_GOLD, RAW_REWARD_ALLOWED)).toEqual({ offenders: [], stale: [] });
  });

  it('의뢰 정보 창의 네임드 카드는 보상을 금액 표기로 직접 그리지 않는다', () => {
    const src = presentationFiles.find(f => f.path === 'views/overlays/bounty/QuestInfoCards.tsx')!.src;
    const from = src.indexOf('export function NamedInfoCard');
    const to = src.indexOf('export function EmptyInfoCard');
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    expect(src.slice(from, to)).not.toMatch(/fmtGold\(/);
  });

  it('판매 합계와 판매 가능 금액은 금액 표기로 직접 그리지 않는다', () => {
    expect(checked.filter(f => SALE_TOTAL_IN_GOLD.test(f.src)).map(f => f.path)).toEqual([]);
  });

  it('버튼 안의 AdjustedAmount는 inButton을 준다 - 버튼 안에 포커스 칸과 터치 툴팁을 두지 않는다', () => {
    expect(checked.filter(f => adjustedInButtonWithoutFlag(f.src).length > 0).map(f => f.path)).toEqual([]);
    expect(presentationFiles.some(f => /<Button\b[\s\S]*?<AdjustedAmount\b[^>]*\binButton\b/.test(f.src))).toBe(true);
  });

  it('취소선으로 금액을 직접 그리지 않는다 - 정가와 보정 금액의 취소선은 PriceTag와 AdjustedAmount만 정한다', () => {
    expect(checked.filter(f => /<s[\s>]|line-through/.test(f.src)).map(f => f.path)).toEqual([]);
  });

  it('감지 함수: value 꺼내기, 원본 보상, 판매 합계 표기, 버튼 안 AdjustedAmount를 잡고 올바른 표기는 가린다', () => {
    expect(VALUE_IN_GOLD.test('{fmtGold(x.value)}')).toBe(true);
    expect(RAW_REWARD_IN_GOLD.test('{fmtGold(quest.reward)}')).toBe(true);
    expect(RAW_REWARD_IN_GOLD.test('{fmtGold(reward.value)}')).toBe(false);
    expect(SALE_TOTAL_IN_GOLD.test('{fmtGold(total)}')).toBe(true);
    expect(SALE_TOTAL_IN_GOLD.test('{fmtGold(preview.sellable)}')).toBe(true);
    expect(SALE_TOTAL_IN_GOLD.test('<AdjustedAmount amount={total} />')).toBe(false);
    expect(adjustedInButtonWithoutFlag('<Button onClick={go}>판매 <AdjustedAmount amount={a} /></Button>')).toHaveLength(1);
    expect(adjustedInButtonWithoutFlag('<button>판매 <AdjustedAmount amount={a} inButton /></button>')).toEqual([]);
    expect(adjustedInButtonWithoutFlag('<Frame as="button" onClick={go}><AdjustedAmount amount={a} /></Frame>')).toHaveLength(1);
    expect(adjustedInButtonWithoutFlag('<Frame as="button"><AdjustedAmount amount={a} inButton /></Frame>')).toEqual([]);
    expect(adjustedInButtonWithoutFlag('<Frame><AdjustedAmount amount={a} /></Frame>')).toEqual([]);
    expect(adjustedInButtonWithoutFlag('<button><AdjustedAmount amount={a} inButton={false} /></button>')).toHaveLength(1);
    expect(adjustedInButtonWithoutFlag('<Note><AdjustedAmount amount={a} /></Note>')).toEqual([]);
  });

  // 어종 선택 표 — 판매 창과 부엌 창의 기운 얻기 탭은 같은 표를 쓴다. 한쪽만 고쳐져 갈라지는 길을 막는다
  const FISH_PICK_SCREENS = ['views/overlays/facility/FacilityModal.tsx', 'views/overlays/facility/EnergyTab.tsx'];
  it('판매 창과 기운 얻기 탭은 어종 선택 표를 공용 FishPickTable로 그린다 - 행과 개체 줄을 직접 그리지 않는다', () => {
    for (const path of FISH_PICK_SCREENS) {
      const src = presentationFiles.find(f => f.path === path)?.src ?? '';
      expect(src, path).toMatch(/<FishPickTable\b/);
      expect(src, path).not.toMatch(/<InstanceLine\b|<UnsizedLine\b/);
    }
  });

  // 팝오버 — 버튼에 붙어 뜨는 작은 칸은 공용 Popover 하나다. 바깥 누르기 리스너를 화면이 직접 걸면 닫는 방법이 갈라진다
  const OUTSIDE_PRESS = /addEventListener\(\s*['"](?:pointerdown|mousedown|touchstart)['"]/;
  const OUTSIDE_PRESS_EXCEPTIONS = new Set([
    'views/overlays/menu/GameMenu.tsx', // 게임 메뉴 드롭다운 - 공용 Popover 이전 구현이다(줄이기만 한다)
  ]);
  it('화면은 바깥 누르기 닫기를 직접 구현하지 않고 Popover를 쓴다 - 예외 목록의 자리만', () => {
    const using = screenFiles.filter(f => OUTSIDE_PRESS.test(f.src)).map(f => f.path);
    expect(using.filter(p => !OUTSIDE_PRESS_EXCEPTIONS.has(p))).toEqual([]);
    expect([...OUTSIDE_PRESS_EXCEPTIONS].filter(p => !using.includes(p))).toEqual([]);
    expect(OUTSIDE_PRESS.test(`document.addEventListener('pointerdown', onDown)`)).toBe(true);
  });
  it('부엌 창의 해역별 기운 대상은 Popover가 연다 - 창을 더 열지 않는다', () => {
    const src = presentationFiles.find(f => f.path === 'views/overlays/facility/EnergyTab.tsx')?.src ?? '';
    expect(src).toMatch(/<Popover\b/);
    expect(src).not.toMatch(/<Modal\b|<ModalCard\b/);
  });

  // 등급 괄호 표기 — 등급이 있는 대상의 이름은 이름 뒤에 등급을 괄호로 붙이고, 그 조립은 공용 gradeName(shared) 하나가 한다.
  // 표현 계층과 기능 계층 모두 같은 함수를 쓴다
  const GRADE_IN_PARENS = /\(\$\{RARITY\[[^\]]+\]\.name\}\)/;
  const featureFiles = Object.entries(import.meta.glob('../../features/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
    .map(([key, src]) => ({ path: key.replace(/^\.\.\/\.\.\//, ''), src }))
    .filter(f => !isTestFile(f.path));
  it('이름 뒤 괄호 등급 표기는 공용 gradeName으로만 만든다', () => {
    const offenders = [...presentationFiles, ...featureFiles].filter(f => GRADE_IN_PARENS.test(f.src)).map(f => f.path);
    expect(offenders).toEqual([]);
    expect([...presentationFiles, ...featureFiles].some(f => /shared\/lib\/gradeName'/.test(f.src))).toBe(true);
    expect(GRADE_IN_PARENS.test('`${name}(${RARITY[grade].name})`')).toBe(true);
  });
  // 슬롯 화면 - 슬롯 효과의 시간, 지속, 교체 판정은 기능 모델이 정하고 화면은 그 결과만 그린다. 칩은 칩 자신만 포인터 이벤트를 받는다
  const SLOT_SCREENS = ['ui/hud/SlotChips.tsx', 'views/game/tabs/bag/ItemSection.tsx'];
  it('슬롯 화면은 슬롯의 끝나는 시각, 지속, 교체 판정을 다시 계산하지 않는다', () => {
    for (const path of SLOT_SCREENS) {
      const src = presentationFiles.find(f => f.path === path)?.src ?? '';
      expect(src, path).not.toBe('');
      expect(src, path).not.toMatch(/\bendsAt\b|\bslotMs\b|\bwaitMs\b|COOK_KIND_RULES|\.slots\b/);
    }
  });
  it('슬롯 칩은 칩 껍데기(HudChip)와 공용 잠금(Locked)으로 그리고, 칩 껍데기가 칩 자신만 포인터 이벤트를 받게 한다', () => {
    const chips = presentationFiles.find(f => f.path === 'ui/hud/SlotChips.tsx')!.src;
    expect(chips).toMatch(/<HudChip\b/);
    expect(chips).toMatch(/<Locked\b/);
    expect(presentationFiles.find(f => f.path === 'ui/hud/HudChip.tsx')!.src).toContain('pointer-events-auto');
  });
});
