/// <reference types="node" />
// 화면 층 가드 - 층 순서를 z 토큰 값과 각 층의 구성 요소 사용에 묶는다.
// 아래부터 스테이지 위 HUD, 채팅과 헤더, 창(닫을 수 없는 창이 창 층 맨 위), 탭 메뉴(탭 줄과 시트), 화면 전환 덮개, 툴팁이다. 레이아웃 높이나 겹침은 jsdom이 계산하지 못하므로
// 여기서는 토큰 값의 순서, 숫자 직접 사용 금지, 층별 요소가 자기 토큰을 쓰는지, 카드 메뉴가 채팅 높이를 쓰지 않는지만 본다.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf-8');

const sources = Object.entries(import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>)
  .map(([key, src]) => ({ path: key.replace(/^\.\.\//, '').replace(/^\.\//, 'ui/'), src }))
  .filter(f => !/\.test\.tsx?$/.test(f.path));

const src = (path: string) => {
  const found = sources.find(f => f.path === path);
  if (!found) throw new Error(`소스를 찾지 못했다: ${path}`);
  return found.src;
};

/** 토큰 이름 -> 값 */
const tokens = Object.fromEntries([...css.matchAll(/--z-([a-z-]+):\s*(\d+);/g)].map(m => [m[1], Number(m[2])]));

describe('화면 층 - z 토큰 순서', () => {
  it('아래부터 스테이지 HUD, 채팅과 헤더, 창, 닫을 수 없는 창, 탭 줄과 시트, 전환 덮개, 툴팁 순서다', () => {
    const order = ['stage-hud', 'stage-card', 'chrome', 'menu-row', 'catch-fx', 'stage-modal', 'app-modal', 'blocker', 'tabs', 'veil', 'tooltip', 'devtools'];
    const values = order.map(name => tokens[name]);
    expect(values.every(v => typeof v === 'number')).toBe(true);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  it('창의 바탕은 채팅과 헤더보다 위이고 탭 줄과 시트는 창보다 위다', () => {
    expect(tokens['stage-modal']).toBeGreaterThan(tokens['chrome']);
    expect(tokens['app-modal']).toBeGreaterThan(tokens['chrome']);
    expect(tokens['tabs']).toBeGreaterThan(tokens['stage-modal']);
    expect(tokens['tabs']).toBeGreaterThan(tokens['app-modal']);
  });

  it('닫을 수 없는 창은 다른 창보다 위이고 탭 줄보다 아래다 - 탭 줄 위에는 전환 덮개와 툴팁만 있다', () => {
    expect(tokens['blocker']).toBeGreaterThan(tokens['stage-modal']);
    expect(tokens['blocker']).toBeGreaterThan(tokens['app-modal']);
    expect(tokens['blocker']).toBeLessThan(tokens['tabs']);
    expect(tokens['veil']).toBeGreaterThan(tokens['tabs']);
    expect(tokens['tooltip']).toBeGreaterThan(tokens['veil']);
  });

  it('헤더의 펼친 메뉴 줄은 채팅과 헤더 층 바로 위이고 창 아래다', () => {
    expect(tokens['menu-row']).toBeGreaterThan(tokens['chrome']);
    expect(tokens['menu-row']).toBeLessThan(tokens['stage-modal']);
  });

  it('잡기 이펙트는 획득 카드 위, 헤더의 펼친 메뉴 줄 위이고 창과 탭 메뉴 아래다', () => {
    expect(tokens['catch-fx']).toBeGreaterThan(tokens['stage-card']);
    expect(tokens['catch-fx']).toBeGreaterThan(tokens['chrome']);
    expect(tokens['catch-fx']).toBeGreaterThan(tokens['menu-row']);
    expect(tokens['catch-fx']).toBeLessThan(tokens['stage-modal']);
    expect(tokens['catch-fx']).toBeLessThan(tokens['tabs']);
  });

  it('채팅과 헤더는 스테이지 위 HUD보다 위다', () => {
    expect(tokens['chrome']).toBeGreaterThan(tokens['stage-card']);
    expect(tokens['stage-card']).toBeGreaterThan(tokens['stage-hud']);
  });
});

describe('화면 층 - 구성 요소는 토큰만 쓴다', () => {
  it('z-index는 계층 토큰으로만 지정한다 - 숫자 직접 지정은 컴포넌트 안 겹침용 z-1뿐이다', () => {
    const literal = /(?<![\w(-])(?:-z-|z-(?!\(--z-)(?!1(?![\w\d])))[\w[\]-]+|(?<![\w(-])z-\[(?!1\])[^\]]*\]|\bzIndex\b|\bz-index\b/;
    const offenders = sources.filter(f => literal.test(f.src)).map(f => f.path);
    expect(offenders).toEqual([]);
  });

  it.each([
    ['ui/hud/MessageLog.tsx', '--z-chrome'],
    ['layouts/hud/HudHeader.tsx', '--z-chrome'],
    ['layouts/hud/HudHeader.tsx', '--z-menu-row'],
    ['layouts/hud/HudLayout.tsx', '--z-stage-hud'],
    ['layouts/game-stage/MovePad.tsx', '--z-stage-hud'],
    ['ui/hud/CatchCard.tsx', '--z-stage-card'],
    ['ui/hud/CatchCard.tsx', '--z-catch-fx'],
    ['ui/Modal.tsx', '--z-stage-modal'],
    ['ui/Modal.tsx', '--z-app-modal'],
    ['ui/Modal.tsx', '--z-blocker'],
    ['layouts/game-stage/FerryVeil.tsx', '--z-veil'],
    ['layouts/sidebar/index.tsx', '--z-tabs'],
    ['views/overlays/update/LoadingOverlay.tsx', '--z-veil'],
    ['ui/TooltipBubble.tsx', '--z-tooltip'],
    ['views/devtools/DevTools.tsx', '--z-devtools'],
  ])('%s는 %s를 쓴다', (path, token) => {
    expect(src(path)).toContain(token);
  });

  it('화면 전환 덮개는 화면 전체(fixed)를 덮고 스테이지 안에 갇히지 않게 창 층 자리로 포털한다', () => {
    for (const path of ['layouts/game-stage/FerryVeil.tsx', 'views/overlays/update/LoadingOverlay.tsx']) {
      expect(src(path)).toContain('fixed inset-0');
      expect(src(path)).not.toContain('absolute inset-0');
    }
    expect(src('layouts/game-stage/FerryVeil.tsx')).toContain('createPortal');
  });

  it('앱 창은 공용 창 컴포넌트가 정한 자리로 포털하고, 스테이지 창은 닫을 수 없어도 제자리(스테이지 안)에 둔다', () => {
    const modal = src('ui/Modal.tsx');
    expect(modal).toContain('useWindowHost()');
    expect(modal).toContain("if (layer !== 'app') return modal;");
    expect(modal).toContain('createPortal(modal, windowHost)');
    expect(src('views/overlays/bounty/EncounterModal.tsx')).toMatch(/layer="stage"/);
  });

  it('닫을 수 없는 앱 창(새 버전 안내, 세션 교체 안내, 저장 안 됨 안내)은 스테이지 창이 아니다', () => {
    for (const path of ['views/overlays/update/UpdateModal.tsx', 'views/overlays/update/SessionReplacedModal.tsx', 'views/overlays/update/UnsavedModal.tsx']) {
      expect(src(path)).toContain('closable={false}');
      expect(src(path)).not.toContain('layer="stage"');
    }
  });

  it('창의 층 값은 공용 창 컴포넌트만 정한다 - 개별 창은 층 토큰을 쓰지 않는다', () => {
    const windowTokens = /--z-(?:app-modal|stage-modal|blocker)\b/;
    const offenders = sources.filter(f => windowTokens.test(f.src)).map(f => f.path);
    expect(offenders).toEqual(['ui/Modal.tsx']);
  });

  it('창 층 위에 따로 놓인 층은 시트뿐이고, 시트가 창 자리를 제공한다', () => {
    const slotUsers = sources.filter(f => /<WindowSlot\b/.test(f.src)).map(f => f.path);
    expect(slotUsers).toEqual(['layouts/sidebar/index.tsx']);
  });

  it('탭 줄은 PC 레이아웃과 모바일 레이아웃 모두 창 위 층 토큰을 쓴다 - 탭 줄과 시트가 각각 자기 층을 갖는다', () => {
    const sidebar = src('layouts/sidebar/index.tsx');
    expect(sidebar.match(/z-\(--z-tabs\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('화면 층 - 거점 카드 메뉴는 채팅 높이를 쓰지 않는다', () => {
  it('채팅 높이를 알리거나 비우는 변수와 훅이 없다', () => {
    const files = sources.filter(f => /--log-clear|--log-h\b|useLogHeight/.test(f.src)).map(f => f.path);
    expect(files).toEqual([]);
    expect(css).not.toMatch(/--log-(clear|h)\b/);
    expect(sources.some(f => f.path === 'layouts/hud/useLogHeight.ts')).toBe(false);
  });

  it('채팅은 스테이지 격자의 행이 아니라 게임 영역 아래쪽 위에 겹쳐 뜬다', () => {
    expect(src('ui/hud/MessageLog.tsx')).not.toMatch(/row-start-3|col-span-2/);
    expect(src('layouts/game-stage/GameStageLayout.tsx')).not.toContain('grid-rows-[auto_minmax(0,1fr)_auto]');
    expect(src('ui/hud/MessageLog.tsx')).toContain('z-(--z-chrome)');
  });

  it('카드 메뉴는 세로 스크롤하지 않는다 - 높이가 모자라면 카드를 줄인다', () => {
    const menu = src('views/game/base-menu/BaseMenu.tsx');
    expect(menu).not.toMatch(/pf-vscroll|SCROLL_Y|overflow-(?:y-)?(?:auto|scroll)/);
  });
});

describe('화면 층 - 스타일 파일', () => {
  it('index.css는 z-index를 선언하지 않고 토큰 값만 정의한다', () => {
    expect(css).not.toMatch(/z-index\s*:/);
    const outside = css.replace(/--z-[a-z-]+:\s*\d+;/g, '');
    expect(outside).not.toMatch(/--z-/);
  });
});

describe('화면 층 - 키보드가 올라와도 게임 영역 크기는 바뀌지 않는다', () => {
  it('게임 화면 루트는 키보드 변수만 받고 높이와 위치를 키보드에 맞춰 바꾸지 않는다', () => {
    const view = src('views/game/GameView.tsx');
    expect(view).toContain('style={keyboardStyle(visible)}');
    expect(view.match(/\bvisible\.(?:top|bottom)\b/g) ?? []).toEqual([]);
    expect(css).not.toMatch(/data-keyboard[^{]*\{[^}]*(?:height|inset|top|bottom|padding|margin)\s*:/);
  });

  it('모바일 레이아웃의 탭 줄은 키보드 동안 숨기되(invisible) 자리는 그대로 둔다', () => {
    const sidebar = src('layouts/sidebar/index.tsx');
    const asides = sidebar.match(/<aside\b[^>]*>/g) ?? [];
    const mobileAside = asides.find(a => a.includes('group-data-[keyboard]/root:invisible'));
    expect(mobileAside).toBeDefined();
    expect(sidebar).not.toMatch(/group-data-\[keyboard\]\/root:(?!invisible)/);
  });

  it('키보드 변수와 변형을 쓰는 파일은 허용 목록뿐이고, 소비처는 bottom, top 오프셋이나 invisible만 쓴다', () => {
    const uses = /--keyboard-(?:h|top)\b|data-\[keyboard\]|\bdata-keyboard\b/;
    const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
    const users = walk('src')
      .filter(p => /\.(?:ts|tsx|css)$/.test(p) && !/\.test\.tsx?$/.test(p))
      .filter(p => uses.test(stripComments(readFileSync(p, 'utf-8'))))
      .sort();
    const definers = ['src/presentation/layouts/visibleBox.ts', 'src/presentation/views/game/GameView.tsx'];
    const consumers = [
      'src/presentation/layouts/hud/HudHeader.tsx',
      'src/presentation/layouts/hud/HudLayout.tsx',
      'src/presentation/layouts/sidebar/index.tsx',
      'src/presentation/ui/hud/MobileResourceBar.tsx',
    ];
    expect(users).toEqual([...definers, ...consumers].sort());
    const allowed = /^(?:[\w-]+:)*(?:(?:bottom|top)-\[[^\]]*var\(--keyboard-(?:h|top)[^\]]*\]|group-data-\[keyboard\]\/root:invisible)$/;
    for (const path of consumers) {
      const tokens = stripComments(readFileSync(path, 'utf-8')).match(/[^\s"'`{}]*(?:--keyboard-(?:h|top)\b|data-\[keyboard\])[^\s"'`{}]*/g) ?? [];
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.filter(t => !allowed.test(t)), path).toEqual([]);
    }
  });
});
