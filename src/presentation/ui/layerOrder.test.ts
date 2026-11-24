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
  it('아래부터 stage-hud, stage-status, stage-card, catch-fx, chrome, menu-row, stage-modal, tabs, app-modal, blocker, toast, veil, tooltip, devtools 엄격 오름차순이다', () => {
    const order = [
      'stage-hud', 'stage-status', 'stage-card', 'catch-fx',
      'chrome', 'menu-row', 'stage-modal',
      'tabs', 'app-modal', 'blocker',
      'toast', 'veil', 'tooltip', 'devtools',
    ];
    const values = order.map(name => tokens[name]);
    expect(values.every(v => typeof v === 'number')).toBe(true);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  it('창 위 1줄 알림(toast)은 앱 모달·차단기·탭 줄·시트보다 위이고 전환 덮개와 툴팁보다 아래다', () => {
    expect(tokens['toast']).toBeGreaterThan(tokens['blocker']);
    expect(tokens['toast']).toBeGreaterThan(tokens['app-modal']);
    expect(tokens['toast']).toBeGreaterThan(tokens['tabs']);
    expect(tokens['toast']).toBeLessThan(tokens['veil']);
    expect(tokens['toast']).toBeLessThan(tokens['tooltip']);
  });

  it('스테이지 창은 채팅·헤더·펼친 메뉴보다 위이고 탭 줄·시트보다 아래다', () => {
    expect(tokens['stage-modal']).toBeGreaterThan(tokens['chrome']);
    expect(tokens['stage-modal']).toBeGreaterThan(tokens['menu-row']);
    expect(tokens['stage-modal']).toBeLessThan(tokens['tabs']);
  });

  it('사이드바 앱 모달과 전역 차단기는 탭 줄·시트 위를 덮고, 차단기가 앱 모달보다 위다', () => {
    expect(tokens['app-modal']).toBeGreaterThan(tokens['tabs']);
    expect(tokens['blocker']).toBeGreaterThan(tokens['app-modal']);
    expect(tokens['veil']).toBeGreaterThan(tokens['blocker']);
    expect(tokens['tooltip']).toBeGreaterThan(tokens['veil']);
  });

  it('헤더의 펼친 메뉴 줄은 채팅과 헤더 층 바로 위이고 창 아래다', () => {
    expect(tokens['menu-row']).toBeGreaterThan(tokens['chrome']);
    expect(tokens['menu-row']).toBeLessThan(tokens['stage-modal']);
  });

  it('잡기 이펙트는 획득 카드 위이고 채팅과 헤더 아래다', () => {
    expect(tokens['catch-fx']).toBeGreaterThan(tokens['stage-card']);
    expect(tokens['catch-fx']).toBeLessThan(tokens['chrome']);
  });

  it('스테이지 위 HUD < 입질 상태 고정 슬롯 < 획득 카드 < 채팅과 헤더 순서다', () => {
    expect(tokens['stage-status']).toBeGreaterThan(tokens['stage-hud']);
    expect(tokens['stage-card']).toBeGreaterThan(tokens['stage-status']);
    expect(tokens['chrome']).toBeGreaterThan(tokens['stage-card']);
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
    ['layouts/hud/HudLayout.tsx', '--z-stage-status'],
    ['layouts/game-stage/Field.tsx', '--z-stage-status'],
    ['layouts/game-stage/MovePad.tsx', '--z-stage-hud'],
    ['ui/hud/CatchCard.tsx', '--z-stage-card'],
    ['ui/hud/CatchCard.tsx', '--z-catch-fx'],
    ['ui/Modal.tsx', '--z-stage-modal'],
    ['ui/Modal.tsx', '--z-app-modal'],
    ['ui/Modal.tsx', '--z-blocker'],
    ['ui/FloatingToastLayer.tsx', '--z-toast'],
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

  it('사이드바는 스테이지 모달에 의해 비활성화(hasOpenWindows/useAnyOpenWindow)되지 않고 app 모달만 막는다', () => {
    const sidebar = src('layouts/sidebar/index.tsx');
    expect(sidebar).not.toMatch(/hasOpenWindows|useAnyOpenWindow/);
    expect(sidebar).toContain('useAnyAppWindow');
    expect(sidebar).toContain('hasAppWindows');
  });

  it('Modal의 layer는 필수이며 기본값 app 폴백이 없고, 게임 영역의 모든 Modal 호출은 layer를 명시한다', () => {
    const modal = src('ui/Modal.tsx');
    expect(modal).not.toMatch(/layer\s*=\s*['"]app['"]/);
    expect(modal).toMatch(/layer:\s*'app'/);
    expect(modal).toMatch(/layer:\s*'stage'/);
    const nonAdmin = sources.filter(f => !f.path.startsWith('views/admin/'));
    const missingLayer: string[] = [];
    for (const f of nonAdmin) {
      for (const m of f.src.matchAll(/<Modal\b[^>]*>/g)) {
        if (!/\blayer=/.test(m[0])) missingLayer.push(`${f.path}: ${m[0]}`);
      }
    }
    expect(missingLayer).toEqual([]);
  });

  it('layer="app" 사용처는 사이드바 메뉴 진입 창과 앱 전역 차단기 화이트리스트뿐이다', () => {
    const APP_MODAL_WHITELIST = new Set([
      'views/game/tabs/bag/BagTab.tsx',
      'views/game/tabs/bag/ItemSection.tsx',
      'views/game/tabs/dex/DexDetail.tsx',
      'views/game/tabs/dex/NamedDetail.tsx',
      'views/game/tabs/bag/ArtifactDetail.tsx',
      'views/game/tabs/settings/SettingsTab.tsx',
      'views/overlays/account/AccountModal.tsx',
      'views/overlays/account/MyInfoModal.tsx',
      'views/overlays/settings/SettingsModal.tsx',
      'views/overlays/codes/CodeModal.tsx',
      'views/overlays/letter/LetterModal.tsx',
      'views/overlays/patchnotes/PatchNotesModal.tsx',
      'views/overlays/update/UpdateModal.tsx',
      'views/overlays/update/SessionReplacedModal.tsx',
      'views/overlays/update/UnsavedModal.tsx',
    ]);
    const nonAdminViews = sources.filter(f => f.path.startsWith('views/') && !f.path.startsWith('views/admin/'));
    const appUsers = nonAdminViews
      .filter(f => /layer="app"/.test(f.src))
      .map(f => f.path)
      .sort();
    expect(appUsers).toEqual([...APP_MODAL_WHITELIST].sort());
    // AccountModal은 스테이지 게스트 차단 경로에서는 반드시 layer="stage"로 호출한다
    const gameView = src('views/game/GameView.tsx');
    expect(gameView).toMatch(/<AccountModal\b[^>]*layer="stage"/);
    expect(gameView).not.toMatch(/<AccountModal\b[^>]*layer="app"/);
    // 게임 영역 유래 오버레이는 모두 GameStageLayout 내부에 마운트된다
    const stageStart = gameView.indexOf('<GameStageLayout>');
    const stageEnd = gameView.indexOf('</GameStageLayout>');
    expect(stageStart).toBeGreaterThan(-1);
    expect(stageEnd).toBeGreaterThan(stageStart);
    const outsideStage = gameView.slice(stageEnd);
    for (const overlay of ['WorldMapModal', 'TutorialModal', 'BaitRefundModal', 'WhatsNewModal', 'GoogleReturn', 'AccountModal']) {
      expect(gameView.slice(stageStart, stageEnd)).toContain(`<${overlay}`);
      expect(outsideStage).not.toContain(`<${overlay}`);
    }
  });

  it('fixed 위치 지정은 앱 셸·모달 백드롭·시트·전환 덮개·토스트·툴팁·개발도구 화이트리스트만 허용한다', () => {
    const FIXED_WHITELIST = new Set([
      'ui/Modal.tsx',
      'ui/FloatingToastLayer.tsx',
      'ui/TooltipBubble.tsx',
      'layouts/game-stage/FerryVeil.tsx',
      'layouts/sidebar/index.tsx',
      'views/game/GameView.tsx',
      'views/overlays/update/LoadingOverlay.tsx',
      'views/devtools/DevTools.tsx',
    ]);
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const fixedCssClass = (s: string) =>
      [...s.matchAll(/(['"`])(?:\\.|(?!\1)[^\n])*?\1/g)].some(m => /(?<![\w-])fixed(?![\w-])/.test(m[0]));
    const users = sources
      .filter(f => !f.path.startsWith('views/admin/'))
      .filter(f => fixedCssClass(stripComments(f.src)))
      .map(f => f.path)
      .sort();
    expect(users).toEqual([...FIXED_WHITELIST].sort());
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
