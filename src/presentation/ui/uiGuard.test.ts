// UI 시스템 가드 — 화면(views·layouts)이 공용 UI(ui)를 조합하고, 기본 요소를 직접 구현하지 않게 한다.
// 한 번만 쓰는 화면 조각은 그 화면 파일 안의 지역 컴포넌트로 만들 수 있다. 단 두 화면 이상에 같은 이름의
// 지역 컴포넌트가 생기면 공용 UI로 올려야 한다. 예외 목록은 줄이기만 한다(새 예외를 더하지 않는다).
import { describe, expect, it } from 'vitest';
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
  { pattern: /<button\b/, use: 'Button · IconButton · ToggleChip · SelectList · Frame as="button"' },
  { pattern: /<input\b/, use: 'TextInput · Slider · NumberStepper' },
  { pattern: /<select\b/, use: 'Select' },
  { pattern: /<textarea\b/, use: 'TextArea' },
  { pattern: /<label\b/, use: 'Field(이름표·입력·도움말·오류 묶음)' },
  { pattern: /<table\b/, use: 'DataTable(담는 칸은 TableBox)' },
];

/** 브라우저 기본 대화상자 — 게임 화면은 useDialogs(ConfirmDialog·InputDialog·NoticeDialog)를 쓴다. 예외 없음 */
const SYSTEM_DIALOG = /\bwindow\.(?:confirm|prompt|alert)\(/;

/** 기본 입력 요소 직접 사용 — 기능·앱 진입 코드도 공용 입력 컴포넌트를 쓴다 */
const RAW_INPUT = /<(?:input|textarea|select)\b/;

/** 제목 태그 직접 사용 — 쪽 제목은 PageTitle, 구역은 SectionTitle, 묶음은 Subheading, 창·상자 제목은 Panel·ModalCard의
 *  title이 맡는다. 아래는 그 틀에 맞지 않는 자리라 직접 둔다(줄이기만 한다) */
const RAW_HEADING = /<h[1-6][\s>]/;
const RAW_HEADING_EXCEPTIONS = new Set<string>([]);

/** 화면(views·layouts)의 overflow 직접 지정 — 세로 스크롤은 공용 스크롤 방식(pf-vscroll + pf-scroll-panel)이나 TableBox가 맡는다.
 *  아래는 칸 안에서 표를 가로로 굴려야 하는 자리(관리자 표, 지역 탭 표)와 양방향 표 상자라 직접 둔다(줄이기만 한다) */
const OVERFLOW_DIRECT = /\boverflow-(?:x-|y-)?(?:auto|scroll)\b|\[overflow(?:-x|-y)?:(?:auto|scroll)\]|\boverflow(?:X|Y)?\s*:\s*['"`](?:auto|scroll)['"`]/;
const OVERFLOW_EXCEPTIONS = new Set([
  'views/admin/tabs/BountyFunnelSection.tsx',
  'views/admin/tabs/ChatReportsSection.tsx',
  'views/admin/tabs/LettersTab.tsx',
  'views/admin/tabs/LiveTab.tsx',
  'views/admin/tabs/MetricsTab.tsx',
  'views/admin/tabs/OpsTab.tsx',
  'views/admin/tabs/OverviewTab.tsx',
  'views/admin/tabs/ProgressionTab.tsx',
  'views/game/tabs/region/VRegion.tsx',
]);

/** 막대를 숨기는 스크롤(pf-scroll) — 사이드바처럼 막대가 폭을 흔들면 안 되는 자리에만 쓴다. 창 안은 막대가 보이는 pf-scroll-panel */
const HIDDEN_BAR = /(?<![\w-])pf-scroll(?![\w-])/;
const HIDDEN_BAR_EXCEPTIONS = new Set([
  'layouts/sidebar/index.tsx', // 384px 폭 사이드바 — 탭을 옮길 때 막대가 폭을 흔들지 않게 숨긴다
]);

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

/** 고정 높이 ModalCard(fixed) 안에서 바깥 스크롤 칸 안에 또 다른 스크롤 칸을 중첩한 호출부 */
const FIXED_MODAL_SCROLL_RE = /\bSCROLL_Y(?:_ROWS)?\b|^<TableBox\b|pf-vscroll/;
const nestedScrollInFixedModal = (src: string) =>
  openingTagsAt(src, 'ModalCard')
    .filter(t => /\bfixed\b/.test(t.tag))
    .flatMap(card => {
      const cardBody = childrenOf(src, card, 'ModalCard');
      return openingTagsAt(cardBody, ANY_TAG)
        .filter(t => FIXED_MODAL_SCROLL_RE.test(t.tag))
        .filter(outer => !/\/>\s*$/.test(outer.tag))
        .filter(outer => {
          const name = outer.tag.match(/^<([A-Za-z][\w.]*)/)?.[1];
          if (!name) return false;
          const inner = childrenOf(cardBody, outer, name);
          return openingTags(inner, ANY_TAG).some(tag => FIXED_MODAL_SCROLL_RE.test(tag));
        })
        .map(outer => outer.tag);
    });

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
]);

/** 막대 클래스(보이는 막대 pf-scroll-panel, 호버 막대 pf-scroll-hud, 숨김 pf-scroll) 없이 pf-vscroll만 쓰는 줄 */
const hasVscrollWithoutBar = (line: string) =>
  /pf-vscroll/.test(line) && !/pf-scroll-panel|pf-scroll-hud|(?<![\w-])pf-scroll(?![\w-])/.test(line);

/** 공용 상수(SCROLL_Y) 없이 pf-vscroll을 직접 쓰는 자리 — 세로 스크롤 칸은 공용 상수로 쓴다.
 *  관리자와 개발 도구 화면은 이 규칙을 따로 정한다 */
const VSCROLL_LITERAL_EXCEPTIONS = new Set([
  'layouts/sidebar/index.tsx',         // 막대를 숨기는 사이드바
]);
const isAdminOrDevtools = (path: string) => /^views\/(?:admin|devtools)\//.test(path);

/** 세로 스크롤을 거는 줄이 막대 자리(scrollbar-gutter)를 확보하지 않는 자리 */
const SCROLL_LINE = /pf-vscroll|\boverflow-(?:y-)?(?:auto|scroll)\b|\[overflow(?:-y)?:(?:auto|scroll)\]/;
const GUTTER = /\[scrollbar-gutter:stable/;
const GUTTER_EXCEPTIONS = new Set([
  'ui/hud/MessageLog.tsx', // 캔버스 위 글줄 상자 — 호버 때만 보이는 HUD 막대
  'layouts/sidebar/index.tsx', // 사이드바는 창이 아니며 막대를 숨긴다
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
    const outsidePresentation = appSources.filter(([key]) => key.startsWith('../../'));
    expect(outsidePresentation.length).toBeGreaterThan(0);
    expect(outsidePresentation.filter(([, src]) => RAW_INPUT.test(src)).map(([key]) => key)).toEqual([]);
  });

  it('감지 함수: 기본 입력 요소(<input>, <textarea>, <select>)는 잡고 공용 컴포넌트와 유사 이름은 가린다', () => {
    for (const tag of ['<input type="text" />', '<input/>', '<input>', '<textarea rows={3}>', '<textarea>', '<select value={v}>', '<select>']) {
      expect(RAW_INPUT.test(tag), tag).toBe(true);
    }
    for (const tag of ['<TextInput />', '<TextArea />', '<Select />', '<inputHelper />', '<selectList />']) {
      expect(RAW_INPUT.test(tag), tag).toBe(false);
    }
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
    const LORE_VIEWS = [
      'views/game/tabs/dex/DexDetail.tsx', 'views/game/tabs/dex/NamedDetail.tsx', 'views/game/tabs/bag/ArtifactDetail.tsx',
    ];
    const src = (path: string) => screens.find(f => f.path === path)?.src ?? '';
    for (const path of LORE_VIEWS) {
      expect(src(path), path).toMatch(/<LoreParagraph\b/);
      expect(src(path), path).not.toMatch(/<p\b[^>]*>\s*\{[^}]*(?:\.lore|chronicle)/);
    }
    expect(screens.filter(f => /first-letter:/.test(f.src)).map(f => f.path)).toEqual([]);
  });

  it('로어 문단의 첫 글자 강조는 네임드 상세에서만 켠다', () => {
    const on = screens.filter(f => /<LoreParagraph\b[^>]*\bemphasis\b/.test(f.src)).map(f => f.path);
    expect(on).toEqual(['views/game/tabs/dex/NamedDetail.tsx']);
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
    expect(screens.flatMap(f => nestedScrollInFixedModal(f.src).map(tag => `${f.path}: ${tag}`))).toEqual([]);
    const cell = '<div className={`${SCROLL_Y} flex-1`}>';
    expect(nestedScrollCells(`<Modal onClose={c}>${cell}</div></Modal>`)).toHaveLength(1);
    expect(nestedScrollCells(`<ModalCard title="가">${cell}</div></ModalCard>`)).toHaveLength(1);
    expect(nestedScrollCells(`<ModalCard title="가"><TableBox className="flex-1 min-h-0">x</TableBox></ModalCard>`)).toHaveLength(1);
    expect(nestedScrollCells(`<ModalCard title="가" fixed>${cell}</div></ModalCard>`)).toEqual([]);
    expect(nestedScrollInFixedModal(`<ModalCard title="가" fixed><div className={SCROLL_Y}><div className={SCROLL_Y_ROWS}>x</div></div></ModalCard>`)).toHaveLength(1);
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
  /** confirm을 조각(<>)으로 넘기는 ModalCard 호출부. 카드는 confirm 바로 아래의 버튼을 전폭으로 늘리므로 버튼 둘 이상은 행 요소로 감싼다 */
  const cardsWithFragmentConfirm = (src: string) => openingTags(src, 'ModalCard').filter(tag => /\bconfirm=\{\s*\(?\s*<>/.test(tag));
  it('ModalCard의 confirm은 조각으로 넘기지 않는다 - 버튼이 둘 이상이면 ButtonRow 같은 행 요소로 감싼다', () => {
    expect(screens.flatMap(f => cardsWithFragmentConfirm(f.src).map(tag => `${f.path}: ${tag}`))).toEqual([]);
    expect(cardsWithFragmentConfirm('<ModalCard title="가" confirm={<><Button>가</Button><Button>나</Button></>}>')).toHaveLength(1);
    expect(cardsWithFragmentConfirm('<ModalCard title="가" confirm={(\n<>\n<Button>가</Button></>\n)}>')).toHaveLength(1);
    expect(cardsWithFragmentConfirm('<ModalCard title="가" confirm={<ButtonRow><Button>가</Button><Button>나</Button></ButtonRow>}>')).toEqual([]);
    expect(cardsWithFragmentConfirm('<ModalCard title="가" confirm={<Button full>확인</Button>}>')).toEqual([]);
  });
  it('알림 종류의 문구를 쓰는 화면은 순서도 ALERT_ORDER로 정한다 - 세 알림을 직접 나열하지 않는다', () => {
    expect(screens.filter(f => /\bALERT_COPY\b/.test(f.src) && !/\bALERT_ORDER\b/.test(f.src)).map(f => f.path)).toEqual([]);
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
    'views/overlays/facility/SellTab.tsx',
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
    ['views/overlays/achievements/AchievementsModal.tsx', [
      { line: /fmtGold\(row\.def\.reward\.gold\)/, why: '업적 보상 골드는 보정이 없는 원본 보상이다' },
    ]],
    ['views/overlays/achievements/AchievementCard.tsx', [
      { line: /fmtGold\(reward\.gold\)/, why: '업적 보상 골드는 보정이 없는 원본 보상이다' },
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

  // 어종 선택 표 — 판매 창의 판매 탭과 기운 얻기 탭은 같은 표를 쓴다. 한쪽만 고쳐져 갈라지는 길을 막는다
  const FISH_PICK_SCREENS = ['views/overlays/facility/SellTab.tsx', 'views/overlays/facility/EnergyTab.tsx'];
  it('판매 탭과 기운 얻기 탭은 어종 선택 표를 공용 FishPickTable로 그린다 - 행과 개체 줄을 직접 그리지 않는다', () => {
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
  it('판매 창의 해역별 기운 대상은 Popover가 연다 - 창을 더 열지 않는다', () => {
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
  it('슬롯 칩은 칩 껍데기(HudChip)와 공용 잠금(Locked)으로 그리고, 칩 껍데기는 26px 단일 높이와 포인터 이벤트 격리를 강제한다', () => {
    const chips = presentationFiles.find(f => f.path === 'ui/hud/SlotChips.tsx')!.src;
    expect(chips).toMatch(/<HudChip\b/);
    expect(chips).toMatch(/<Locked\b/);
    const hudChip = presentationFiles.find(f => f.path === 'ui/hud/HudChip.tsx')!.src;
    expect(hudChip).toContain('pointer-events-auto');
    expect(hudChip).toContain('h-[26px]');
    expect(hudChip).not.toMatch(/\bsize\??\s*:/);
    const timeBadge = presentationFiles.find(f => f.path === 'ui/hud/TimeBadge.tsx')!.src;
    expect(timeBadge).not.toMatch(/<HudChip[^>]*\bsize\s*=/);
  });

  // 하단 HUD 흐름 & 낚시 상태 띠·획득 카드 고정 슬롯 분리 — 오른쪽 아래 열과 메시지 창은 하단 단일 흐름 컨테이너 안에 두고,
  // 낚시 상태 띠(statusSlot)와 획득 카드(catchSlot)는 하단 트렁크에서 분리해 스테이지 고정 절대 좌표 슬롯에 둔다.
  it('Field는 PC와 모바일 모두 공용 statusSlot·catchSlot 포털로 상태 띠와 획득 카드를 공급하고 게임 프레임 하단에 따로 절대 배치하지 않는다', () => {
    const field = presentationFiles.find(f => f.path === 'layouts/game-stage/Field.tsx')!.src;
    expect(field).toMatch(/createPortal\(\s*statusBand\s*,\s*statusSlot\s*\)/);
    expect(field).toMatch(/createPortal\(\s*<CatchCard\b[\s\S]*?,\s*catchSlot\s*\)/);
    expect(field).toContain('z-(--z-stage-status)');
    expect(field).not.toMatch(/mobile\s*&&\s*(?:statusSlot|catchSlot)|(?:statusSlot|catchSlot)\s*&&\s*mobile/);
    expect(field).not.toMatch(/\bbottom-3\b|-translate-x-1\/2/);
  });

  it('HudLayout은 statusSlot·catchSlot을 하단 flex-wrap 트렁크와 분리된 독립 absolute 슬롯에 두고, catchSlot 래퍼는 z-index를 갖지 않으며, 오른쪽 아래 열과 메시지 창만 하단 단일 흐름에 둔다', () => {
    const hud = presentationFiles.find(f => f.path === 'layouts/hud/HudLayout.tsx')!.src;
    const log = presentationFiles.find(f => f.path === 'ui/hud/MessageLog.tsx')!.src;
    expect(hud).toMatch(/ref=\{onStatusSlot\}/);
    expect(hud).toMatch(/ref=\{onCatchSlot\}/);
    expect(hud).toContain('z-(--z-stage-status)');
    expect(hud).not.toMatch(/mobile\s*&&\s*<div\b[^>]*ref=\{(?:onStatusSlot|onCatchSlot)\}/);
    const catchSlotTag = openingTagsAt(hud, 'div').find(t => /ref=\{onCatchSlot\}/.test(t.tag))?.tag ?? '';
    expect(catchSlotTag).not.toMatch(/\bz-/);
    expect(hud).not.toMatch(/['"`]contents\b/);
    const hasAllTokens = (tag: string, tokens: readonly string[]) =>
      tokens.every(tok => new RegExp(`(?:^|[\\s'"\`])${tok}(?:$|[\\s'"\`])`).test(tag));
    expect(openingTagsAt(hud, 'div').some(t => hasAllTokens(t.tag, ['absolute', 'right-3', 'bottom-3']))).toBe(false);
    expect(openingTagsAt(log, 'div').some(t => hasAllTokens(t.tag, ['absolute', 'left-3', 'bottom-3']))).toBe(false);
    // statusSlot·catchSlot은 하단 트렁크 div 바깥(앞)에 독립 배치된다
    const slotAt = hud.indexOf('<div ref={onStatusSlot}');
    const catchAt = hud.indexOf('<div ref={onCatchSlot}');
    const trunkAt = hud.lastIndexOf('STACK_TRUNK_CLASS');
    expect(slotAt).toBeGreaterThan(-1);
    expect(catchAt).toBeGreaterThan(slotAt);
    expect(trunkAt).toBeGreaterThan(catchAt);
  });

  // 초록(ok) 상태색 금지 — 초록은 특수 등급에만 쓰고 상태(성공, 활성, 접속)에는 쓰지 않는다
  const OK_STATUS_COLOR = /\b(?:text|bg|border)-ok\b/;
  it('업적과 라이브 오버레이 화면은 비특수 용도의 ok 색 토큰(text-ok·bg-ok·border-ok)을 쓰지 않는다', () => {
    const targets = screenFiles.filter(f => /^views\/overlays\/(?:achievements|live)\//.test(f.path));
    expect(targets.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const { path, src } of targets) {
      src.split('\n').forEach((line, i) => {
        if (OK_STATUS_COLOR.test(line)) offenders.push(`${path}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
    expect(OK_STATUS_COLOR.test('text-ok')).toBe(true);
    expect(OK_STATUS_COLOR.test('bg-ok/10')).toBe(true);
    expect(OK_STATUS_COLOR.test('border-ok/70')).toBe(true);
    expect(OK_STATUS_COLOR.test('text-accent border-gold')).toBe(false);
  });

  // UI 규칙 가드 — 게임 화면과 공용 UI는 둥근 모서리(예외 제외), 완료/잠금 opacity 흐림, 네이티브 title, PillButton,
  // 2px 두꺼운 테두리·베벨, 가운뎃점·대시([·—–])를 쓰지 않는다 (admin/devtools 제외)
  const isGameUi = (p: string) =>
    p.startsWith('ui/') || p.startsWith('layouts/') || p.startsWith('views/game/') || p.startsWith('views/overlays/');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const ROUNDED_RE = /\brounded-(?:sm|md|lg|full|\[[^\]]+\])\b/;
  const ROUNDED_EXCEPTIONS = new Set([
    'ui/TooltipBubble.tsx',                   // 예외: 툴팁 버블
    'ui/hud/Minimap.tsx',                     // 예외: 미니맵 지도 틀
    'ui/GoogleButton.tsx',                    // Google 브랜드 가이드라인 버튼
    'ui/PillButton.tsx',                      // admin/devtools 전용 잔존 유틸 (게임 화면에서 금지)
    'layouts/game-stage/MovePad.tsx',         // 터치 조이스틱 원형 패드
    'views/overlays/world-map/WorldMapModal.tsx', // 세계지도 틀
  ]);
  it('게임 UI는 예외 외에 둥근 모서리(rounded-*)를 쓰지 않는다', () => {
    const targets = presentationFiles.filter(f => isGameUi(f.path) && !ROUNDED_EXCEPTIONS.has(f.path));
    const offenders = targets.filter(f => ROUNDED_RE.test(f.src)).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  const OPACITY_WASH_RE = /(?<!disabled:)\bopacity-(?:40|45|50|55|60|70|80|85|\[0\.(?:45|50|55|70|72)\])\b/;
  it('게임 UI는 완료·잠금·보조 텍스트에 비활성 외 opacity 흐림을 쓰지 않는다', () => {
    const targets = presentationFiles.filter(f => isGameUi(f.path) && f.path !== 'ui/PillButton.tsx' && f.path !== 'ui/ToggleChip.tsx');
    const offenders = targets.filter(f => OPACITY_WASH_RE.test(f.src)).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  const NATIVE_TITLE_RE = /<[a-z][^>]*\stitle=/;
  it('게임 UI는 브라우저 기본 title 속성 툴팁을 쓰지 않는다', () => {
    const targets = presentationFiles.filter(f => isGameUi(f.path));
    const offenders = targets.filter(f => NATIVE_TITLE_RE.test(f.src)).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  it('게임 UI는 PillButton을 쓰지 않는다(admin/devtools 전용)', () => {
    const targets = presentationFiles.filter(f => isGameUi(f.path) && f.path !== 'ui/PillButton.tsx');
    const offenders = targets.filter(f => /\bPillButton\b/.test(f.src)).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  const THICK_BORDER_RE = /(?:\bborder-(?:[trblxy]-)?2\b|inset_-?2px)/;
  it('게임 UI 버튼·칩·카드·모달·레이아웃은 1px 얇은 테두리와 1px 베벨을 쓴다', () => {
    const targets = presentationFiles.filter(
      f => isGameUi(f.path) && f.path !== 'ui/PillButton.tsx',
    );
    const offenders = targets.filter(f => THICK_BORDER_RE.test(f.src)).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  const TIER1_FLAT_PRIMITIVES = [
    'ui/ArrowButton.tsx',
    'ui/ProgressMeter.tsx',
    'ui/SegmentedStepBar.tsx',
    'ui/hud/BagMeter.tsx',
    'ui/hud/HudChip.tsx',
    'ui/ToggleChip.tsx',
  ];
  const TIER1_BEVEL_RE = /(?:\bpf-bevel\b|\bPRESSED_BEVEL\b|inset_-?1px)/;
  it('26px 이하 소형 요소와 12px 이하 트랙은 베벨 없는 평면 1px 테두리(Tier 1)를 쓴다', () => {
    const offenders = TIER1_FLAT_PRIMITIVES.filter(path => {
      const src = presentationFiles.find(f => f.path === path)?.src ?? '';
      return TIER1_BEVEL_RE.test(src);
    });
    expect(offenders).toEqual([]);
  });

  const RAW_INSET_CLIP_RE = /(?:shadow-\[inset_|\[clip-path:)/;
  it('게임 화면은 인라인 inset 그림자와 clip-path를 직접 쓰지 않고 공용 UI와 노치 토큰을 쓴다', () => {
    const targets = screenFiles.filter(f => f.path.startsWith('views/game/') || f.path.startsWith('views/overlays/'));
    const offenders = targets.filter(f => RAW_INSET_CLIP_RE.test(f.src)).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  const HARDCODED_HEX_RE = /(?:bg|border|text|from|to|via|ring|outline)-\[#/;
  it('게임 화면은 16진 색상 클래스를 박지 않고 시맨틱 토큰을 쓴다', () => {
    const targets = screenFiles.filter(f => f.path.startsWith('views/game/') || f.path.startsWith('views/overlays/'));
    const offenders = targets.filter(f => HARDCODED_HEX_RE.test(f.src)).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  const RAW_DIVIDER_RE = /\b(?:w|h)-px\b[^\n]*\bbg-line\b|\bbg-line\b[^\n]*\b(?:w|h)-px\b/;
  it('게임 화면은 1px 선을 직접 그리지 않고 Divider를 쓴다', () => {
    const targets = screenFiles.filter(f => f.path.startsWith('views/game/') || f.path.startsWith('views/overlays/'));
    const offenders = targets.filter(f => RAW_DIVIDER_RE.test(f.src)).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  const CLICKABLE_NONBUTTON_RE = /<(?:div|span)\b[^>]*\brole=(?:\{[^}]*['"]button['"]|['"]button['"])/;
  const CLICKABLE_NONBUTTON_EXCEPTIONS = new Set([
    'views/game/tabs/bag/BagTab.tsx',
    'views/overlays/bounty/EncounterModal.tsx',
  ]);
  it('게임 화면의 누를 수 있는 칸은 div/span role="button" 대신 button/Frame as="button"을 쓴다', () => {
    const targets = screenFiles.filter(
      f => (f.path.startsWith('views/game/') || f.path.startsWith('views/overlays/'))
        && !CLICKABLE_NONBUTTON_EXCEPTIONS.has(f.path),
    );
    const offenders = targets.filter(f => CLICKABLE_NONBUTTON_RE.test(f.src)).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  const PUNCT_RE = /[·—–]/;
  it('게임 UI와 기능 모델 코드 문자열은 가운뎃점·줄표를 쓰지 않는다', () => {
    const targets = [...presentationFiles, ...featureFiles].filter(
      f => !f.path.includes('/admin/') && !f.path.includes('/devtools/')
        && !f.path.startsWith('views/admin/') && !f.path.startsWith('views/devtools/'),
    );
    const offenders = targets.filter(f => PUNCT_RE.test(stripComments(f.src))).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  // 버튼·확정 영역 고정 높이 금지 — 텍스트나 수치를 담는 Button과 data-confirm-row 확정 영역 래퍼는 줄바꿈 시 함께 늘어나야 하므로 고정 높이(h-*, [&>*]:h-full)를 쓰지 않는다
  const BUTTON_FIXED_HEIGHT_RE = /(?<![\w-])(?:h-(?:\d+|\[[^\]]+\]|full|screen|dvh|svh|fit)|size-(?:\d+|\[[^\]]+\]))/;
  const CONFIRM_ROW_FIXED_HEIGHT_RE = /(?<![\w-])(?:h-(?:\d+|\[[^\]]+\]|full|screen|dvh|svh|fit)|size-(?:\d+|\[[^\]]+\]))|\[&[^\]]*\]:h-/;
  /** 따옴표("·')와 표현식({...}) 안의 `>`를 건너뛰며 여는 태그와 끝 위치를 찾는다 */
  const openingTagsQuoted = (src: string, name: string): { tag: string; end: number }[] => {
    const tags: { tag: string; end: number }[] = [];
    for (const m of src.matchAll(new RegExp(`<${name}\\b`, 'g'))) {
      let depth = 0;
      let quote: '"' | "'" | null = null;
      let i = m.index;
      for (; i < src.length; i++) {
        const c = src[i];
        if (quote) {
          if (c === '\\') { i++; continue; }
          if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'") quote = c;
        else if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '>' && depth === 0) break;
      }
      tags.push({ tag: src.slice(m.index, i + 1), end: i + 1 });
    }
    return tags;
  };
  /** 여는 태그 자신의 속성 영역만 남긴다({ ... } 중첩 표현식은 뺀다) */
  const ownTagHead = (tag: string) => {
    let depth = 0;
    let out = '';
    for (const c of tag) {
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (depth === 0) out += c;
    }
    return out;
  };
  const isIconOnlySquareButton = (tag: string, body: string) => {
    if (!/(?<![\w-])size-(?:\d+|\[[^\]]+\])/.test(tag)) return false;
    const withoutTags = body.replace(/<[^>]+>/g, '');
    const stripped = withoutTags.replace(/\{[^}]*&&\s*\}/g, '').replace(/\s+/g, '');
    return stripped === '';
  };
  const fixedHeightButtons = (src: string, path = '') =>
    openingTagsQuoted(src, '(?:Button|ConfirmButton)')
      .filter(t => BUTTON_FIXED_HEIGHT_RE.test(t.tag))
      .filter(t => {
        if (/\/>\s*$/.test(t.tag)) return true;
        const name = t.tag.startsWith('<ConfirmButton') ? 'ConfirmButton' : 'Button';
        const body = childrenOf(src, t, name);
        return !isIconOnlySquareButton(t.tag, body);
      })
      .map(t => `${path ? `${path}: ` : ''}${t.tag}`);
  const fixedHeightConfirmRows = (src: string, path = '') =>
    openingTagsQuoted(src, ANY_TAG)
      .filter(t => /\bdata-confirm-row\b/.test(ownTagHead(t.tag)) && CONFIRM_ROW_FIXED_HEIGHT_RE.test(t.tag))
      .map(t => `${path ? `${path}: ` : ''}${t.tag}`);

  it('텍스트·수치를 담는 Button과 data-confirm-row는 고정 높이를 쓰지 않는다 — 아이콘 전용 정사각형만 예외', () => {
    expect(presentationFiles.flatMap(f => fixedHeightButtons(f.src, f.path))).toEqual([]);
    expect(presentationFiles.flatMap(f => fixedHeightConfirmRows(f.src, f.path))).toEqual([]);

    expect(fixedHeightButtons('<Button variant="primary" full className="h-11">판매 (10마리)</Button>')).toHaveLength(1);
    expect(fixedHeightButtons('<Button className="h-[44px]">확인</Button>')).toHaveLength(1);
    expect(fixedHeightButtons('<Button className="size-11">99</Button>')).toHaveLength(1);
    expect(fixedHeightButtons('<Button className="size-11"><PixelIcon glyph="plus" /> 추가</Button>')).toHaveLength(1);
    expect(fixedHeightButtons('<Button className="h-full aspect-square"><PixelIcon glyph="gear" /></Button>')).toHaveLength(1);
    expect(fixedHeightButtons('<Button variant="primary" full className="min-h-11">판매 (10마리)</Button>')).toEqual([]);
    expect(fixedHeightButtons('<Button className="size-11 shrink-0 p-0"><PixelIcon glyph="gear" size={14} /></Button>')).toEqual([]);
    expect(fixedHeightButtons('<Button className="size-11 shrink-0 p-0"><PixelIcon glyph="gear" />{flag && <span className="size-1.5" />}</Button>')).toEqual([]);

    expect(fixedHeightConfirmRows('<div data-confirm-row className="flex flex-col h-11 [&>*]:h-full">{actions}</div>')).toHaveLength(1);
    expect(fixedHeightConfirmRows('<div data-confirm-row className="flex flex-col [&>*]:h-full">{actions}</div>')).toHaveLength(1);
    expect(fixedHeightConfirmRows('<div data-confirm-row className="flex flex-col min-h-11">{actions}</div>')).toEqual([]);
  });

  // Inset 테두리 색 — 기본 border-line이 CSS 선언 순서상 className의 border-epic/gold/accent 등을 덮어쓰므로
  // 테두리 색은 Inset의 border prop으로만 지정하고 className이나 borderless + border 우회를 쓰지 않는다
  const INSET_BORDER_COLOR_RE = /\bborder-(?:line(?:-dim)?|gold(?:-dark)?|orange|accent|guild|danger|common|rare|epic|legend|special|ok|bg|surface(?:-2)?|text(?:-dim)?|\[[^\]]+\])(?:\/\d+)?\b/;
  const INSET_RAW_BORDER_RE = /(?<![\w-])border(?![\w-])/;
  const insetClassExpr = (tag: string): string | null => {
    let depth = 0;
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < tag.length; i++) {
      const c = tag[i];
      if (quote) {
        if (c === '\\') { i++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '{') { depth++; continue; }
      if (c === '}') { depth--; continue; }
      if (depth === 0 && tag.startsWith('className', i)) {
        const rest = tag.slice(i + 'className'.length);
        const eq = /^\s*=\s*/.exec(rest);
        if (!eq) continue;
        const start = i + 'className'.length + eq[0].length;
        const first = tag[start];
        if (first === '"' || first === "'") {
          let end = start + 1;
          while (end < tag.length && tag[end] !== first) {
            if (tag[end] === '\\') end++;
            end++;
          }
          return tag.slice(start + 1, end);
        }
        if (first === '{') {
          let d = 0;
          let q: '"' | "'" | '`' | null = null;
          let end = start;
          for (; end < tag.length; end++) {
            const ch = tag[end];
            if (q) {
              if (ch === '\\') { end++; continue; }
              if (ch === q) q = null;
              continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') q = ch;
            else if (ch === '{') d++;
            else if (ch === '}') { d--; if (d === 0) break; }
          }
          return tag.slice(start + 1, end);
        }
      }
    }
    return null;
  };
  const localConstBodies = (src: string, expr: string): string[] => {
    const names = new Set(expr.match(/\b[A-Za-z_]\w*\b/g) ?? []);
    const bodies: string[] = [];
    for (const name of names) {
      if (name === 'cx' || name === 'className') continue;
      const m = new RegExp(`\\bconst\\s+${name}\\b[^=]*=\\s*([\\s\\S]*?)(?=;\\r?\\n|\\n(?:const|function|export)\\b|$)`).exec(src);
      if (m) bodies.push(m[1]);
    }
    return bodies;
  };
  const insetBorderOverrides = (src: string, path = '') =>
    openingTagsQuoted(src, 'Inset')
      .filter(t => {
        const expr = insetClassExpr(t.tag);
        if (!expr) return false;
        const targets = [expr, ...localConstBodies(src, expr)];
        if (targets.some(part => INSET_BORDER_COLOR_RE.test(part))) return true;
        return /\bborderless\b/.test(ownTagHead(t.tag)) && targets.some(part => INSET_RAW_BORDER_RE.test(part));
      })
      .map(t => `${path ? `${path}: ` : ''}${t.tag}`);

  it('Inset 호출부는 className으로 테두리 색이나 borderless 수동 border 우회를 쓰지 않고 border prop으로만 지정한다', () => {
    expect(presentationFiles.flatMap(f => insetBorderOverrides(f.src, f.path))).toEqual([]);

    expect(insetBorderOverrides('<Inset className="px-3 border-accent text-accent">x</Inset>')).toHaveLength(1);
    expect(insetBorderOverrides('<Inset className={done ? "border-gold p-3" : "p-3"}>x</Inset>')).toHaveLength(1);
    expect(insetBorderOverrides('<Inset borderless className={cx("p-2 border", on ? "border-accent" : "border-line")}>x</Inset>')).toHaveLength(1);
    expect(insetBorderOverrides('<Inset borderless className="p-2 border">x</Inset>')).toHaveLength(1);
    expect(insetBorderOverrides('const cls = () => "border-gold";\n<Inset className={cls()}>x</Inset>')).toHaveLength(1);
    expect(insetBorderOverrides('<Inset border="accent" className="px-3 text-accent">x</Inset>')).toEqual([]);
    expect(insetBorderOverrides('<Inset border={s.grade ? "epic" : undefined} className="border-dashed text-text-dim">x</Inset>')).toEqual([]);
    expect(insetBorderOverrides('<Inset borderless tone="deep" className="flex flex-wrap gap-1">x</Inset>')).toEqual([]);
  });

  // 비동기 상태 구분 — null·미설정·오류를 '불러오는 중'이나 '연결 중' 같은 로딩 문구로 폴백하지 않는다
  const NULLISH_LOADING_FALLBACK_RE = /(?:\?\?|\|\|)\s*(?:<[^>]+>)?\s*['"`][^'"`\r\n]*(?:불러오는 중|연결 중)/;
  const NULL_EQ_LOADING_FALLBACK_RE = /(?:===?\s*null\b|!\s*(?:view|data|blocks|uid|nickname|guild|profile|preview)\b)\s*\?\s*(?:<[^>]+>)?\s*[^:\r\n]*(?:불러오는 중|연결 중)/;
  const VALUE_TRUTHY_LOADING_FALLBACK_RE = /\b(?:uid|nickname|blocks|view|data|guild|profile|preview)\s*\?\s*[^:\r\n]+:\s*(?:<[^>]+>)?\s*['"`][^'"`\r\n]*(?:불러오는 중|연결 중)/;

  const asyncLoadingFallbacks = (src: string, path = '') => {
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const hits: string[] = [];
    for (const [i, line] of code.split(/\r?\n/).entries()) {
      if (NULLISH_LOADING_FALLBACK_RE.test(line)
        || NULL_EQ_LOADING_FALLBACK_RE.test(line)
        || VALUE_TRUTHY_LOADING_FALLBACK_RE.test(line)) {
        hits.push(`${path ? `${path}:${i + 1}: ` : ''}${line.trim()}`);
      }
    }
    return hits;
  };

  it('표현 계층은 nullish/null 폴백으로 로딩 문구(불러오는 중·연결 중)를 표시하지 않는다', () => {
    expect(presentationFiles.flatMap(f => asyncLoadingFallbacks(f.src, f.path))).toEqual([]);

    expect(asyncLoadingFallbacks('{nickname ?? "불러오는 중"}')).toHaveLength(1);
    expect(asyncLoadingFallbacks('{uid || "연결 중"}')).toHaveLength(1);
    expect(asyncLoadingFallbacks('{blocks === null ? <Note>차단 목록을 불러오는 중이에요.</Note> : null}')).toHaveLength(1);
    expect(asyncLoadingFallbacks('{!view ? <Note>초대를 불러오는 중이에요.</Note> : null}')).toHaveLength(1);
    expect(asyncLoadingFallbacks('{uid ? maskUid(uid) : "연결 중"}')).toHaveLength(1);
    expect(asyncLoadingFallbacks('{loading ? <Note>목록을 불러오는 중이에요.</Note> : null}')).toEqual([]);
    expect(asyncLoadingFallbacks('{status === "loading" ? "불러오는 중" : "미설정"}')).toEqual([]);
  });

  // 툴팁 해부학 가드 — HelpHint 은퇴, LockLines 외부 조립 금지, MenuCard·Locked의 TipCard 사용
  it('게임 UI는 물음표 도움말 아이콘(HelpHint)을 쓰지 않고 공용 Tip을 쓴다', () => {
    const targets = presentationFiles.filter(f => isGameUi(f.path));
    expect(targets.filter(f => /\bHelpHint\b/.test(f.src)).map(f => f.path)).toEqual([]);
    expect(presentationFiles.some(f => f.path === 'ui/HelpHint.tsx')).toBe(false);
  });

  it('잠금 툴팁 줄은 ui/Locked.tsx 외부에서 <LockLines로 직접 조립하지 않고 Locked·LockTip·TipCard를 쓴다', () => {
    const targets = presentationFiles.filter(f => f.path !== 'ui/Locked.tsx');
    expect(targets.filter(f => /<LockLines\b/.test(f.src)).map(f => f.path)).toEqual([]);
  });

  it('MenuCard와 Locked는 구조형 툴팁 TipCard로 잠금 헤더와 구분선 위계를 유지한다', () => {
    const menuCard = presentationFiles.find(f => f.path === 'ui/MenuCard.tsx')!.src;
    const locked = presentationFiles.find(f => f.path === 'ui/Locked.tsx')!.src;
    expect(menuCard).toMatch(/<TipCard\b/);
    expect(locked).toMatch(/<TipCard\b/);
  });

  // 기획·구현 내부 용어와 AI 슬롭 문구 재유입 가드 (테스트·admin·devtools·patchnotes·주석 제외)
  const SLOP_COPY_RE = /한국 시간 새벽|운 배율|일반 폼|돌연변이 폼|클라우드 세이브|을\(를\)|친구 성사/;
  it('게임·기능·화면 노출 코드 문자열은 기획·시간대·구현 직역 용어를 쓰지 않는다', () => {
    const gameFiles = Object.entries(
      import.meta.glob('../../game/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
    )
      .map(([key, src]) => ({ path: key.replace(/^\.\.\/\.\.\//, ''), src }))
      .filter(f => !isTestFile(f.path));

    const targets = [...gameFiles, ...featureFiles, ...presentationFiles].filter(
      f => !f.path.includes('/admin/') && !f.path.includes('/devtools/')
        && !f.path.startsWith('views/admin/') && !f.path.startsWith('views/devtools/')
        && !f.path.includes('patchnotes'),
    );
    const offenders = targets.filter(f => SLOP_COPY_RE.test(stripComments(f.src))).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  // 등급색 표기 및 공용 툴팁 등급색 구조 가드
  const RAW_RARITY_NAME_RE = /\b(?:RARITY|DISPLAY_GRADE)\[[^\]]+\]\.name\b/;
  it('게임 UI는 RarityTag 외부에서 RARITY[...].name을 민글자로 쓰지 않고 RarityText·GradeName을 쓴다', () => {
    const targets = presentationFiles.filter(
      f => isGameUi(f.path) && f.path !== 'ui/fish/RarityTag.tsx',
    );
    const offenders = targets.filter(f => RAW_RARITY_NAME_RE.test(stripComments(f.src))).map(f => f.path);
    expect(offenders).toEqual([]);
    expect(RAW_RARITY_NAME_RE.test('<th>{RARITY[r].name}</th>')).toBe(true);
    expect(RAW_RARITY_NAME_RE.test('{DISPLAY_GRADE[g].name}')).toBe(true);
    expect(RAW_RARITY_NAME_RE.test('<RarityText rarity={r} />')).toBe(false);
  });

  it('공용 툴팁(TipList·TipCard·RecipeEffectTip·Locked·MessageTip)은 ReactNode와 등급색 강조를 유지한다', () => {
    const tipSrc = presentationFiles.find(f => f.path === 'ui/Tip.tsx')!.src;
    const recipeTipSrc = presentationFiles.find(f => f.path === 'ui/RecipeEffectTip.tsx')!.src;
    const lockedSrc = presentationFiles.find(f => f.path === 'ui/Locked.tsx')!.src;
    const messageFeedSrc = presentationFiles.find(f => f.path === 'ui/hud/messageFeed.ts')!.src;

    expect(tipSrc).toMatch(/HighlightRarityText/);
    expect(tipSrc).toMatch(/function TipList\(\{ rows, note \}:\s*\{\s*rows:\s*readonly\s*\{\s*label:\s*ReactNode;\s*value:\s*ReactNode(?:;\s*divider\?:\s*boolean)?\s*\}\[\];\s*note\?:\s*ReactNode/);
    expect(recipeTipSrc).toMatch(/HighlightRarityText/);
    expect(recipeTipSrc).toMatch(/export type RecipeEffectTipRow\s*=\s*\|\s*\{\s*label:\s*ReactNode;\s*value:\s*ReactNode\s*\}\s*\|\s*\{\s*text:\s*ReactNode\s*\}/);
    expect(recipeTipSrc).toMatch(/label:\s*ReactNode;\s*effects:\s*readonly\s*RecipeEffectTipRow\[\];\s*note:\s*ReactNode/);
    expect(lockedSrc).toMatch(/title\?:\s*ReactNode/);
    expect(lockedSrc).toMatch(/description\?:\s*ReactNode/);
    expect(messageFeedSrc).toMatch(/rows:\s*readonly\s*\{\s*label:\s*ReactNode;\s*value:\s*ReactNode\s*\}\[\]/);
  });

  it('유물 목록 바깥 행은 로어를 노출하지 않고, ItemDetail·ArtifactDetail 상세 창 본문은 로어(설명)를 효과와 주의사항 앞에 둔다', () => {
    const bagTabSrc = stripComments(presentationFiles.find(f => f.path === 'views/game/tabs/bag/BagTab.tsx')!.src);
    const itemDetailSrc = stripComments(presentationFiles.find(f => f.path === 'views/game/tabs/bag/ItemDetail.tsx')!.src);
    const artifactDetailSrc = stripComments(presentationFiles.find(f => f.path === 'views/game/tabs/bag/ArtifactDetail.tsx')!.src);

    expect(bagTabSrc).not.toMatch(/\.lore\b/);

    const itemLoreAt = itemDetailSrc.indexOf('<LoreParagraph');
    const itemEffectsAt = itemDetailSrc.indexOf('effects.length');
    const itemNoteAt = itemDetailSrc.indexOf('<Note');
    expect(itemLoreAt).toBeGreaterThan(-1);
    expect(itemEffectsAt).toBeGreaterThan(itemLoreAt);
    expect(itemNoteAt).toBeGreaterThan(itemEffectsAt);

    const artifactLoreAt = artifactDetailSrc.indexOf('<LoreParagraph');
    const compareAt = artifactDetailSrc.indexOf('<CompareTable');
    const systemAt = artifactDetailSrc.indexOf('<SystemRows');
    expect(artifactLoreAt).toBeGreaterThan(-1);
    expect(compareAt).toBeGreaterThan(artifactLoreAt);
    expect(systemAt).toBeGreaterThan(artifactLoreAt);
  });

  it('화면과 기능 코드에서 %p 표기를 쓰지 않는다', () => {
    const PCT_POINT_RE = /%p\b/;
    const offenders = appSources
      .filter(([key, src]) => !isTestFile(key) && PCT_POINT_RE.test(stripComments(src)))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
    expect(PCT_POINT_RE.test('판매가 +5%p')).toBe(true);
    expect(PCT_POINT_RE.test('판매가 +5%')).toBe(false);
    expect(PCT_POINT_RE.test('배수 ×1.05')).toBe(false);
  });

  const FONT_PIXEL_RE = /\bfont-pixel\b/;
  it('표현 계층은 Tailwind font-pixel을 직접 쓰지 않고 .pf-accent와 공용 수치 컴포넌트를 쓴다', () => {
    const offenders = presentationFiles.filter(f => FONT_PIXEL_RE.test(stripComments(f.src))).map(f => f.path);
    expect(offenders).toEqual([]);
    expect(FONT_PIXEL_RE.test('className="font-pixel text-gold"')).toBe(true);
    expect(FONT_PIXEL_RE.test('className="pf-accent text-gold"')).toBe(false);
  });

  it('공용 ProgressCount는 .pf-accent 서체와 골드 현재값·보조색 기준 분모 계약을 유지한다', () => {
    const src = stripComments(presentationFiles.find(f => f.path === 'ui/ProgressCount.tsx')!.src);
    expect(src).toContain('pf-accent');
    expect(src).toContain("gold: 'text-gold'");
    expect(src).toContain("guild: 'text-guild'");
    expect(src).toContain("accent: 'text-accent'");
    expect(src).toContain("orange: 'text-orange'");
    expect(src).toContain("danger: 'text-danger'");
    expect(src).toContain('text-text-dim');
    expect(src).toContain('data-progress-count');
    expect(src).toContain('data-progress-current');
    expect(src).toContain('data-progress-target');
    expect(src).toContain('data-progress-percent');
  });

  it('랭킹 표(RankingModal·DexDetail)는 공용 RankList와 RankMeBar로 1~3위 골드·내 줄 하늘색·수치 열 골드 강조를 공유한다', () => {
    const rankListSrc = stripComments(presentationFiles.find(f => f.path === 'ui/RankList.tsx')!.src);
    const rankingModalSrc = stripComments(presentationFiles.find(f => f.path === 'views/overlays/ranking/RankingModal.tsx')!.src);
    const dexDetailSrc = stripComments(presentationFiles.find(f => f.path === 'views/game/tabs/dex/DexDetail.tsx')!.src);

    expect(rankListSrc).toContain('<ProgressCount');
    expect(rankListSrc).toContain('r.rank <= 3');
    expect(rankListSrc).toContain('text-gold');
    expect(rankListSrc).toContain('bg-accent/10');
    expect(rankListSrc).toContain('text-accent');
    expect(rankingModalSrc).toMatch(/<RankList\b/);
    expect(rankingModalSrc).toMatch(/<RankMeBar\b/);
    expect(rankingModalSrc).not.toMatch(/<DataTable\b/);
    expect(dexDetailSrc).toMatch(/<RankList\b/);
    expect(dexDetailSrc).toMatch(/<RankMeBar\b/);
  });

  it('선택 가능 상세(운세 달력)와 다단계·형태 전환 창(소식·도감 상세)은 고정·최소 높이로 전환 시 레이아웃이 밀리지 않는다', () => {
    const fortuneSrc = stripComments(presentationFiles.find(f => f.path === 'views/overlays/fortune/FortuneCalendarModal.tsx')!.src);
    const fortuneCollectionSrc = stripComments(presentationFiles.find(f => f.path === 'views/overlays/fortune/FortuneCollectionTab.tsx')!.src);
    const fortuneToneSrc = stripComments(presentationFiles.find(f => f.path === 'views/overlays/fortune/fortuneTone.ts')!.src);
    const whatsNewSrc = stripComments(presentationFiles.find(f => f.path === 'views/overlays/whats-new/WhatsNewModal.tsx')!.src);
    const dexDetailSrc = stripComments(presentationFiles.find(f => f.path === 'views/game/tabs/dex/DexDetail.tsx')!.src);

    expect(fortuneSrc).toMatch(/<Modal\b[^>]*height=\{500\}/);
    expect(fortuneSrc).toMatch(/<Modal\b[^>]*mobileHeight=\{552\}/);
    expect(fortuneSrc).toMatch(/<ModalCard\b[^>]*fixed\b/);
    expect(fortuneSrc).toContain('grid-rows-6');
    expect(fortuneSrc).toMatch(/disabled=\{cell\.isFuture \|\| !f\}/);
    expect(fortuneSrc).toMatch(/aria-label="선택한 날짜 운세 상세"/);
    expect(fortuneSrc).toMatch(/h-\[\d+px\][^>]*aria-label="선택한 날짜 운세 상세"/);
    expect(fortuneSrc).not.toMatch(/\bSCROLL_Y\b|\bSCROLL_Y_ROWS\b|overflow-y-auto/);
    expect(fortuneSrc).not.toContain('월간 운세 집계');
    expect(fortuneCollectionSrc).not.toMatch(/\bSCROLL_Y\b|\bSCROLL_Y_ROWS\b|overflow-y-auto/);
    expect(fortuneCollectionSrc).toContain('grid-rows-7');
    expect(fortuneToneSrc).toContain('text-named');

    expect(whatsNewSrc).toMatch(/<Modal\b[^>]*height=\{/);
    expect(whatsNewSrc).toMatch(/<ModalCard\b[\s\S]*?\bfixed\b/);
    expect(whatsNewSrc).toMatch(/aria-hidden="true"/);

    expect(dexDetailSrc).toMatch(/<LoreParagraph[^>]*min-h-/);
    expect(dexDetailSrc).toMatch(/<p[^>]*min-h-/);
  });

  it('운세 UI는 구형 표기(지수·%p·만날 확률·보너스 대상·미기록·TodayFortuneBanner·FortuneIndexMeter)를 쓰지 않는다', () => {
    const fortuneFiles = presentationFiles.filter(f => !isTestFile(f.path) && f.path.startsWith('views/overlays/fortune/'));
    const BANNED_FORTUNE_RE = /지수|만날 확률|%p|%P|보너스 대상|미기록|기록 없음|\bTodayFortuneBanner\b|\bFortuneIndexMeter\b/;
    const offenders = fortuneFiles.filter(f => BANNED_FORTUNE_RE.test(stripComments(f.src))).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  it('시맨틱 색이 걸린 줄 안에 HighlightRarityText를 중첩하지 않고 Tip 경고 첫 줄도 원문을 그대로 쓴다', () => {
    const semanticLineWithHighlight = /className=\{?[^>\n]*\btext-(?:accent|danger|gold|guild|epic|mutation|named)\b[^>\n]*\}?[^>]*>[^<\n]*<HighlightRarityText\b/;
    const semanticBlockWithHighlight = /className=\{?[^>\n]*\btext-(?:accent|danger|gold|guild|epic|mutation|named)\b[^>\n]*\}?[^>]*>[\s\S]{0,160}?<HighlightRarityText\b/;
    const kvSemanticValueWithHighlight = /value=\{<HighlightRarityText\b[\s\S]{0,120}?valueClassName=\{?[^}\n]*\btext-(?:accent|danger|gold|guild|epic|mutation|named)\b/;
    const offenders = presentationFiles
      .filter(f => !isTestFile(f.path))
      .filter(f => {
        const clean = stripComments(f.src);
        return semanticLineWithHighlight.test(clean)
          || semanticBlockWithHighlight.test(clean)
          || kvSemanticValueWithHighlight.test(clean);
      })
      .map(f => f.path);
    expect(offenders).toEqual([]);

    const tipSrc = stripComments(presentationFiles.find(f => f.path === 'ui/Tip.tsx')!.src);
    expect(tipSrc).toMatch(/status\.tone === 'warn'\s*\?\s*line\s*:\s*highlightText\(line\)/);
  });

  it('ScrollRow는 hidden·inline-flex 충돌 없이 edge.prev·edge.next 조건부 렌더로 화살표를 표시한다', () => {
    const scrollRowSrc = stripComments(presentationFiles.find(f => f.path === 'ui/ScrollRow.tsx')!.src);
    expect(scrollRowSrc).toMatch(/\{edge\.prev\s*&&\s*\(?\s*<ArrowButton\b/);
    expect(scrollRowSrc).toMatch(/\{edge\.next\s*&&\s*\(?\s*<ArrowButton\b/);
    expect(scrollRowSrc).not.toMatch(/['"`][^'"`]*(?<![\w-])hidden(?![\w-])[^'"`]*['"`]/);
  });

  it('ToggleChip은 체크 아이콘을 렌더링하지 않고 호출부도 체크 아이콘을 삽입하지 않는다', () => {
    const toggleSrc = stripComments(presentationFiles.find(f => f.path === 'ui/ToggleChip.tsx')!.src);
    expect(toggleSrc).not.toMatch(/glyph="check"/);

    const toggleBlock = /<ToggleChip\b[\s\S]*?<\/ToggleChip>/g;
    const callers = presentationFiles
      .filter(f => !isTestFile(f.path) && f.path !== 'ui/ToggleChip.tsx')
      .filter(f => [...stripComments(f.src).matchAll(toggleBlock)].some(m => /glyph="check"/.test(m[0])))
      .map(f => f.path);
    expect(callers).toEqual([]);
  });

  // 툴팁 내 수동 불릿 조립 금지 — TipBullets·TipCard bullets 공용 컴포넌트만 쓴다
  const MANUAL_TOOLTIP_BULLET_SPAN_RE = /<span[^>]*>\s*(?:-|•|\{['"](?:-|•)['"]\})\s*<\/span>/;
  const MANUAL_TOOLTIP_BULLET_CHAR_RE = /(?:•|\\n\s*-\s+|['"`]\s*-\s+[^\d])/;
  const manualTooltipBullets = (src: string, path = '') =>
    openingTagsQuoted(src, '(?:Tip|TipCard|TipList)')
      .filter(t => MANUAL_TOOLTIP_BULLET_SPAN_RE.test(t.tag) || MANUAL_TOOLTIP_BULLET_CHAR_RE.test(t.tag))
      .map(t => `${path ? `${path}: ` : ''}${t.tag}`);

  it('툴팁은 수동 - 또는 • 불릿 문자를 조립하지 않고 TipBullets와 TipCard bullets를 쓴다', () => {
    const tipSrc = stripComments(presentationFiles.find(f => f.path === 'ui/Tip.tsx')!.src);
    expect(tipSrc).toMatch(/export function TipBullets\b/);
    expect(tipSrc).not.toMatch(/<(?:ul|li)\b/);
    expect(tipSrc).toMatch(/bullets\?:\s*readonly\s+ReactNode\[\]/);

    const offenders = presentationFiles
      .filter(f => !isTestFile(f.path))
      .flatMap(f => manualTooltipBullets(stripComments(f.src), f.path));
    expect(offenders).toEqual([]);

    expect(manualTooltipBullets('<Tip text={<span><span aria-hidden="true">-</span><span>안내</span></span>}>대상</Tip>')).toHaveLength(1);
    expect(manualTooltipBullets('<Tip text={"- 첫째\\n- 둘째"}>대상</Tip>')).toHaveLength(1);
    expect(manualTooltipBullets('<TipCard title="안내" description={"• 첫째\\n• 둘째"} />')).toHaveLength(1);
    expect(manualTooltipBullets('<Tip text={<TipBullets items={["첫째", "둘째"]} />}>대상</Tip>')).toEqual([]);
    expect(manualTooltipBullets('<TipCard title="안내" bullets={["첫째", "둘째"]} />')).toEqual([]);
  });

  it('전면 차단 모달(ConsentModal, RestrictedModal)은 공용 AppBrandBar를 사용한다', () => {
    for (const path of ['views/overlays/account/ConsentModal.tsx', 'views/overlays/account/RestrictedModal.tsx']) {
      const fileSrc = stripComments(presentationFiles.find(f => f.path === path)!.src);
      expect(fileSrc, path).toContain('<AppBrandBar');
      expect(fileSrc, path).not.toContain('PIXEL FISHING');
    }
  });
});
