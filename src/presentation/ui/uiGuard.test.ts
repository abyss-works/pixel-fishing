// UI 시스템 가드 — 화면(views·layouts)이 공용 UI(ui)를 조합하고, 기본 요소를 직접 구현하지 않게 한다.
// 한 번만 쓰는 화면 조각은 그 화면 파일 안의 지역 컴포넌트로 만들 수 있다. 단 두 화면 이상에 같은 이름의
// 지역 컴포넌트가 생기면 공용 UI로 올려야 한다. 예외 목록은 줄이기만 한다(새 예외를 더하지 않는다).
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

/** glob 키 → presentation 기준 경로. 이 파일과 같은 폴더(ui)는 './X', 나머지는 '../views/X'로 온다 */
const rel = (key: string) => (key.startsWith('./') ? `ui/${key.slice(2)}` : key.replace(/^\.\.\//, ''));
const keyOf = (path: string) => (path.startsWith('ui/') ? `./${path.slice(3)}` : `../${path}`);
const isTestOrStory = (path: string) => /\.(?:test|stories)\.tsx?$/.test(path);
const screens = Object.entries(sources)
  .map(([key, src]) => ({ path: rel(key), src }))
  .filter(f => /^(views|layouts)\//.test(f.path) && f.path.endsWith('.tsx') && !isTestOrStory(f.path));

/** 직접 구현 금지 — 화면에서 보이면 왼쪽 공용 UI를 쓴다 */
const PRIMITIVES: { pattern: RegExp; use: string }[] = [
  { pattern: /\bpf-frame\b/, use: 'Frame(틀) · Panel(제목 있는 박스)' },
  { pattern: /\bpf-btn\b/, use: 'Button · LinkButton(다른 페이지 링크)' },
  { pattern: /<button\b/, use: 'Button · IconButton · PillButton · SelectList · Frame as="button"' },
  { pattern: /<input\b/, use: 'TextInput · Slider · NumberStepper' },
  { pattern: /<select\b/, use: 'Select' },
  { pattern: /<textarea\b/, use: 'TextArea' },
];

/** 브라우저 기본 대화상자 — 게임 화면은 useDialogs(ConfirmDialog·InputDialog·NoticeDialog)를 쓴다. 예외 없음 */
const SYSTEM_DIALOG = /\bwindow\.(?:confirm|prompt|alert)\(/;

/** 이야기(스토리) 없이 둘 수 있는 공용 UI — 게임 상태가 있어야 그려지는 HUD와 저수준 캔버스뿐이다 */
const STORY_EXCEPTIONS = new Set([
  'ui/SpriteCanvas.tsx',
  'ui/hud/CatchCard.tsx', 'ui/hud/MessageLog.tsx', 'ui/hud/NightOverlay.tsx',
  'ui/hud/ResourceBar.tsx', 'ui/hud/TimeBadge.tsx',
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
    expect(screens.filter(f => SYSTEM_DIALOG.test(f.src)).map(f => f.path)).toEqual([]);
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

  it('공용 UI 컴포넌트는 카탈로그(스토리)를 가진다', () => {
    const components = Object.entries(sources)
      .map(([key, src]) => ({ path: rel(key), src }))
      .filter(f => /^ui\//.test(f.path) && f.path.endsWith('.tsx') && !isTestOrStory(f.path)
        && /export default function [A-Z]/.test(f.src));
    const missing = components
      .filter(f => !sources[keyOf(f.path.replace(/\.tsx$/, '.stories.tsx'))])
      .map(f => f.path);
    expect(components.length).toBeGreaterThan(30); // 검사가 비어 있지 않은지
    expect(missing.filter(p => !STORY_EXCEPTIONS.has(p))).toEqual([]);
    expect([...STORY_EXCEPTIONS].filter(p => !missing.includes(p))).toEqual([]);
  });
});
