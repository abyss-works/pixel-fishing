/// <reference types="node" />
// 화면 층 가드 - 층 순서를 z 토큰 값과 각 층의 구성 요소 사용에 묶는다.
// 아래부터 스테이지 위 HUD, 채팅과 헤더, 창(닫을 수 없는 창이 창 층 맨 위), 탭 메뉴(탭 줄과 시트), 화면 전환 덮개, 툴팁이다. 레이아웃 높이나 겹침은 jsdom이 계산하지 못하므로
// 여기서는 토큰 값의 순서, 숫자 직접 사용 금지, 층별 요소가 자기 토큰을 쓰는지, 카드 메뉴가 채팅 높이를 쓰지 않는지만 본다.
import { readFileSync } from 'node:fs';
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
    const order = ['stage-hud', 'stage-card', 'chrome', 'menu-row', 'stage-modal', 'app-modal', 'blocker', 'tabs', 'veil', 'tooltip', 'devtools'];
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
