// UI 시스템 가드 — 화면(views·layouts)이 공용 UI(ui)를 조합하고, 기본 요소를 직접 구현하지 않게 한다.
// 한 번만 쓰는 화면 조각은 그 화면 파일 안의 지역 컴포넌트로 만들 수 있다. 단 두 화면 이상에 같은 이름의
// 지역 컴포넌트가 생기면 공용 UI로 올려야 한다. 예외 목록은 줄이기만 한다(새 예외를 더하지 않는다).
import { describe, expect, it } from 'vitest';

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
});
