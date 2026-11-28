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

type LayerAttr =
  | { kind: 'literal'; value: string }
  | { kind: 'expr'; raw: string }
  | { kind: 'boolean' };

/** 주석 밖의 JSX 여는 태그(`<Name ...>`)를 찾는다. 따옴표("·'·`)와 중괄호({...}) 안의 `>`(화살표 함수 `=>`, 비교 연산 등)에서 조기 종료하지 않는다 */
function jsxOpeningTags(source: string, tagName: string): string[] {
  const tags: string[] = [];
  const pattern = new RegExp(`<${tagName}(?=[\\s/>])`, 'g');
  const inCommentAt = (pos: number): boolean => {
    const lineStart = source.lastIndexOf('\n', pos - 1) + 1;
    const beforeOnLine = source.slice(lineStart, pos);
    let q: '"' | "'" | null = null;
    for (let k = 0; k < beforeOnLine.length; k++) {
      const ch = beforeOnLine[k];
      if (q) {
        if (ch === '\\') { k++; continue; }
        if (ch === q) q = null;
      } else if (ch === '"' || ch === "'") {
        q = ch;
      } else if (ch === '/' && beforeOnLine[k + 1] === '/') {
        return true;
      }
    }
    const lastOpen = source.lastIndexOf('/*', pos - 1);
    if (lastOpen >= 0) {
      const lastClose = source.lastIndexOf('*/', pos - 1);
      if (lastClose < lastOpen) return true;
    }
    return false;
  };
  const scanBalancedBraces = (start: number): number => {
    let depth = 0;
    let quote: '"' | "'" | '`' | null = null;
    const tplBraces: number[] = [];
    for (let i = start; i < source.length; i++) {
      const c = source[i];
      if (quote === '`') {
        if (c === '\\') { i++; continue; }
        if (c === '`') { quote = null; continue; }
        if (c === '$' && source[i + 1] === '{') {
          tplBraces.push(depth);
          depth++;
          i++;
        }
        continue;
      }
      if (quote) {
        if (c === '\\') { i++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '/' && source[i + 1] === '/') {
        const nl = source.indexOf('\n', i + 2);
        i = nl < 0 ? source.length : nl;
        continue;
      }
      if (c === '/' && source[i + 1] === '*') {
        const end = source.indexOf('*/', i + 2);
        i = end < 0 ? source.length : end + 1;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (tplBraces.length > 0 && tplBraces[tplBraces.length - 1] === depth) {
          tplBraces.pop();
          quote = '`';
        } else if (depth === 0) {
          return i;
        }
      }
    }
    return source.length - 1;
  };

  for (const m of source.matchAll(pattern)) {
    if (inCommentAt(m.index)) continue;
    let i = m.index + m[0].length;
    let quote: '"' | "'" | '`' | null = null;
    for (; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === '\\') { i++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '/' && source[i + 1] === '/') {
        const nl = source.indexOf('\n', i + 2);
        i = nl < 0 ? source.length : nl;
        continue;
      }
      if (c === '/' && source[i + 1] === '*') {
        const end = source.indexOf('*/', i + 2);
        i = end < 0 ? source.length : end + 1;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') i = scanBalancedBraces(i);
      else if (c === '>') break;
    }
    tags.push(source.slice(m.index, i + 1));
  }
  return tags;
}

/** 여는 태그 자신의 최상위 속성에서 `layer` 값을 읽는다 (중첩 JSX 표현식 안의 layer는 무시) */
function readOwnLayerAttr(tag: string): LayerAttr | undefined {
  const headEnd = tag.endsWith('/>') ? tag.length - 2 : tag.length - 1;
  let i = tag.search(/[\s/>]/);
  if (i < 0 || i >= headEnd) return undefined;

  const skipExpr = (start: number): number => {
    let depth = 0;
    let quote: '"' | "'" | '`' | null = null;
    const tplBraces: number[] = [];
    for (let k = start; k < headEnd; k++) {
      const c = tag[k];
      if (quote === '`') {
        if (c === '\\') { k++; continue; }
        if (c === '`') { quote = null; continue; }
        if (c === '$' && tag[k + 1] === '{') { tplBraces.push(depth); depth++; k++; }
        continue;
      }
      if (quote) {
        if (c === '\\') { k++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (tplBraces.length > 0 && tplBraces[tplBraces.length - 1] === depth) {
          tplBraces.pop();
          quote = '`';
        } else if (depth === 0) {
          return k;
        }
      }
    }
    return headEnd - 1;
  };

  while (i < headEnd) {
    while (i < headEnd && /\s/.test(tag[i])) i++;
    if (i >= headEnd) break;
    if (tag[i] === '{') {
      i = skipExpr(i) + 1;
      continue;
    }
    const nameStart = i;
    while (i < headEnd && /[\w-]/.test(tag[i])) i++;
    const name = tag.slice(nameStart, i);
    if (!name) { i++; continue; }
    while (i < headEnd && /\s/.test(tag[i])) i++;
    let attr: LayerAttr = { kind: 'boolean' };
    if (tag[i] === '=') {
      i++;
      while (i < headEnd && /\s/.test(tag[i])) i++;
      if (tag[i] === '"' || tag[i] === "'") {
        const q = tag[i++];
        const valStart = i;
        while (i < headEnd && tag[i] !== q) {
          if (tag[i] === '\\') i++;
          i++;
        }
        attr = { kind: 'literal', value: tag.slice(valStart, i) };
        i++;
      } else if (tag[i] === '{') {
        const end = skipExpr(i);
        attr = { kind: 'expr', raw: tag.slice(i + 1, end).trim() };
        i = end + 1;
      } else {
        const valStart = i;
        while (i < headEnd && !/[\s>]/.test(tag[i])) i++;
        attr = { kind: 'expr', raw: tag.slice(valStart, i) };
      }
    }
    if (name === 'layer') return attr;
  }
  return undefined;
}

const MODAL_LAYER_COMPONENTS = [
  { name: 'Modal', defaultLayer: null },
  { name: 'ConfirmDialog', defaultLayer: 'app' },
  { name: 'InputDialog', defaultLayer: 'app' },
  { name: 'NoticeDialog', defaultLayer: 'app' },
  { name: 'AccountModal', defaultLayer: null },
] as const;

interface DialogHookCall {
  fn: 'confirm' | 'input' | 'notice';
  layer: LayerAttr | undefined;
}

/** `useDialogs()`의 `confirm`/`input`/`notice` 객체 리터럴 호출과 최상위 `layer` 옵션을 읽는다 */
function dialogHookCalls(source: string): DialogHookCall[] {
  if (!/\buseDialogs\b/.test(source)) return [];
  const calls: DialogHookCall[] = [];
  const skipStringOrComment = (i: number): number | null => {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i + 2);
      return nl < 0 ? source.length : nl + 1;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      return end < 0 ? source.length : end + 2;
    }
    if (c === '"' || c === "'" || c === '`') {
      let k = i + 1;
      for (; k < source.length; k++) {
        if (source[k] === '\\') { k++; continue; }
        if (source[k] === c) return k + 1;
      }
      return source.length;
    }
    return null;
  };
  const readObjLayer = (objStart: number, objEnd: number): LayerAttr | undefined => {
    let depth = 0;
    let i = objStart + 1;
    while (i < objEnd) {
      const jumped = skipStringOrComment(i);
      if (jumped !== null) { i = jumped; continue; }
      const c = source[i];
      if (c === '{' || c === '[' || c === '(') { depth++; i++; continue; }
      if (c === '}' || c === ']' || c === ')') { depth--; i++; continue; }
      if (depth === 0 && /[\w$]/.test(c)) {
        const start = i;
        while (i < objEnd && /[\w$]/.test(source[i])) i++;
        const key = source.slice(start, i);
        let j = i;
        while (j < objEnd && /\s/.test(source[j])) j++;
        if (key === 'layer' && (source[j] === ':' || source[j] === ',' || source[j] === '}')) {
          if (source[j] !== ':') return { kind: 'expr', raw: 'layer' };
          j++;
          while (j < objEnd && /\s/.test(source[j])) j++;
          if (source[j] === '"' || source[j] === "'") {
            const q = source[j++];
            const valStart = j;
            while (j < objEnd && source[j] !== q) { if (source[j] === '\\') j++; j++; }
            return { kind: 'literal', value: source.slice(valStart, j) };
          }
          const valStart = j;
          let vDepth = 0;
          while (j < objEnd) {
            const sj = skipStringOrComment(j);
            if (sj !== null) { j = sj; continue; }
            const ch = source[j];
            if (ch === '{' || ch === '[' || ch === '(') vDepth++;
            else if (ch === '}' || ch === ']' || ch === ')') {
              if (vDepth === 0) break;
              vDepth--;
            } else if (ch === ',' && vDepth === 0) break;
            j++;
          }
          return { kind: 'expr', raw: source.slice(valStart, j).trim() };
        }
        continue;
      }
      i++;
    }
    return undefined;
  };

  for (let i = 0; i < source.length; i++) {
    const jumped = skipStringOrComment(i);
    if (jumped !== null) { i = jumped - 1; continue; }
    if (!/[a-z]/.test(source[i])) continue;
    if (i > 0 && /[.\w$]/.test(source[i - 1])) continue;
    const match = /^(confirm|input|notice)\s*\(\s*\{/.exec(source.slice(i));
    if (!match) continue;
    const objStart = i + match[0].length - 1;
    let depth = 0;
    let end = objStart;
    for (; end < source.length; end++) {
      const sj = skipStringOrComment(end);
      if (sj !== null) { end = sj - 1; continue; }
      if (source[end] === '{') depth++;
      else if (source[end] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    calls.push({ fn: match[1] as DialogHookCall['fn'], layer: readObjLayer(objStart, end) });
    i = end;
  }
  return calls;
}

/** 해당 소스 파일이 `app` 레이어 모달/대화상자를 사용하는지(생략 시 기본값 `app` 폴백 포함) 판정한다 */
function usesAppLayerModal(source: string): boolean {
  for (const { name, defaultLayer } of MODAL_LAYER_COMPONENTS) {
    for (const tag of jsxOpeningTags(source, name)) {
      const layer = readOwnLayerAttr(tag);
      if (!layer) {
        if (defaultLayer === 'app' || defaultLayer === null) return true;
        continue;
      }
      if (layer.kind === 'literal' && layer.value === 'app') return true;
      if (layer.kind === 'expr' && /['"`]app['"`]/.test(layer.raw)) return true;
    }
  }
  for (const call of dialogHookCalls(source)) {
    if (!call.layer) return true;
    if (call.layer.kind === 'literal' && call.layer.value === 'app') return true;
    if (call.layer.kind === 'expr' && (call.layer.raw === 'layer' || /['"`]app['"`]/.test(call.layer.raw))) return true;
  }
  return false;
}

/** 토큰 이름 -> 값 */
const tokens = Object.fromEntries([...css.matchAll(/--z-([a-z-]+):\s*(\d+);/g)].map(m => [m[1], Number(m[2])]));

describe('화면 층 - z 토큰 순서', () => {
  it('아래부터 stage-hud, stage-status, stage-card, catch-fx, chrome, menu-row, stage-modal, toast, tabs, app-modal, blocker, veil, tooltip, devtools 엄격 오름차순이다', () => {
    const order = [
      'stage-hud', 'stage-status', 'stage-card', 'catch-fx',
      'chrome', 'menu-row', 'stage-modal', 'toast',
      'tabs', 'app-modal', 'blocker',
      'veil', 'tooltip', 'devtools',
    ];
    const values = order.map(name => tokens[name]);
    expect(values.every(v => typeof v === 'number')).toBe(true);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  it('스테이지 위 1줄 알림(toast)은 스테이지 창보다 위이고 탭 줄·시트·앱 모달·차단기보다 아래다', () => {
    expect(tokens['toast']).toBeGreaterThan(tokens['stage-modal']);
    expect(tokens['toast']).toBeLessThan(tokens['tabs']);
    expect(tokens['toast']).toBeLessThan(tokens['app-modal']);
    expect(tokens['toast']).toBeLessThan(tokens['blocker']);
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
    ['views/overlays/live/NoticeStack.tsx', '--z-toast'],
    ['layouts/game-stage/FerryVeil.tsx', '--z-veil'],
    ['layouts/game-stage/EventZoneVeil.tsx', '--z-veil'],
    ['layouts/sidebar/index.tsx', '--z-tabs'],
    ['views/overlays/update/LoadingOverlay.tsx', '--z-veil'],
    ['ui/TooltipBubble.tsx', '--z-tooltip'],
    ['ui/Modal.tsx', '--z-devtools'],
    ['views/devtools/DevTools.tsx', '--z-devtools'],
  ])('%s는 %s를 쓴다', (path, token) => {
    expect(src(path)).toContain(token);
  });

  it('화면 전환 덮개는 화면 전체(fixed)를 덮고 스테이지 안에 갇히지 않게 창 층 자리로 포털한다', () => {
    for (const path of [
      'layouts/game-stage/FerryVeil.tsx',
      'layouts/game-stage/EventZoneVeil.tsx',
      'views/overlays/update/LoadingOverlay.tsx',
    ]) {
      expect(src(path)).toContain('fixed inset-0');
      expect(src(path)).not.toContain('absolute inset-0');
    }
    expect(src('layouts/game-stage/FerryVeil.tsx')).toContain('createPortal');
    expect(src('layouts/game-stage/EventZoneVeil.tsx')).toContain('createPortal');
  });

  it('앱 창은 공용 창 컴포넌트가 정한 자리로 포털하고, 스테이지 창은 닫을 수 없어도 제자리(스테이지 안)에 두며, 개발 도구 창은 body로 포털한다', () => {
    const modal = src('ui/Modal.tsx');
    expect(modal).toContain('useWindowHost()');
    expect(modal).toContain("if (layer === 'stage') return modal;");
    expect(modal).toContain('createPortal(modal, windowHost)');
    expect(modal).toContain('createPortal(modal, document.body)');
    expect(src('views/overlays/bounty/EncounterModal.tsx')).toMatch(/layer="stage"/);
  });

  it('닫을 수 없는 앱 창(새 버전 안내, 세션 교체 안내, 저장 안 됨 안내, 이용약관 동의, 이용 제한 안내)은 스테이지 창이 아니다', () => {
    for (const path of [
      'views/overlays/update/UpdateModal.tsx',
      'views/overlays/update/SessionReplacedModal.tsx',
      'views/overlays/update/UnsavedModal.tsx',
      'views/overlays/update/RateLimitModal.tsx',
      'views/overlays/account/ConsentModal.tsx',
      'views/overlays/account/RestrictedModal.tsx',
    ]) {
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
      for (const tag of jsxOpeningTags(f.src, 'Modal')) {
        if (!readOwnLayerAttr(tag)) missingLayer.push(`${f.path}: ${tag}`);
      }
    }
    expect(missingLayer).toEqual([]);
  });

  it('layer="app" 사용처는 사이드바 메뉴 진입 창과 앱 전역 차단기 화이트리스트뿐이다', () => {
    const APP_MODAL_WHITELIST = new Set([
      'views/game/tabs/bag/BagTab.tsx',
      'views/game/tabs/bag/ItemDetail.tsx',
      'views/game/tabs/bag/ItemSection.tsx',
      'views/game/tabs/dex/DexDetail.tsx',
      'views/game/tabs/dex/EventFishDetail.tsx',
      'views/game/tabs/dex/NamedDetail.tsx',
      'views/game/tabs/region/RegionLoreModal.tsx',
      'views/game/tabs/bag/ArtifactDetail.tsx',
      'views/game/tabs/settings/SettingsTab.tsx',
      'views/overlays/account/AccountModal.tsx',
      'views/overlays/account/ConsentModal.tsx',
      'views/overlays/account/MyInfoModal.tsx',
      'views/overlays/account/RestrictedModal.tsx',
      'views/overlays/facility/EnergyPanel.tsx',
      'views/overlays/settings/SettingsModal.tsx',
      'views/overlays/codes/CodeModal.tsx',
      'views/overlays/letter/LetterModal.tsx',
      'views/overlays/patchnotes/PatchNotesModal.tsx',
      'views/overlays/update/UpdateModal.tsx',
      'views/overlays/update/SessionReplacedModal.tsx',
      'views/overlays/update/UnsavedModal.tsx',
      'views/overlays/update/RateLimitModal.tsx',
    ]);
    const nonAdminViews = sources.filter(f => f.path.startsWith('views/') && !f.path.startsWith('views/admin/'));
    const appUsers = nonAdminViews
      .filter(f => usesAppLayerModal(f.src))
      .map(f => f.path)
      .sort();
    expect(appUsers).toEqual([...APP_MODAL_WHITELIST].sort());
    // AccountModal은 스테이지 게스트 차단 경로에서는 반드시 layer="stage"로 호출한다
    const gameView = src('views/game/GameView.tsx');
    const accountTags = jsxOpeningTags(gameView, 'AccountModal');
    expect(accountTags.length).toBeGreaterThan(0);
    for (const tag of accountTags) {
      expect(readOwnLayerAttr(tag)).toEqual({ kind: 'literal', value: 'stage' });
    }
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

  it('감지 함수: 화살표 함수(`=>`)와 비교 연산(`>`)이 포함된 태그, layer 생략 기본값 app 폴백을 정확히 판정한다', () => {
    const withArrowBeforeLayer = '<Modal onClose={() => { if (a > 0) close(); }} layer="stage"><p>x</p></Modal>';
    expect(jsxOpeningTags(withArrowBeforeLayer, 'Modal')).toEqual([
      '<Modal onClose={() => { if (a > 0) close(); }} layer="stage">',
    ]);
    expect(readOwnLayerAttr(jsxOpeningTags(withArrowBeforeLayer, 'Modal')[0])).toEqual({ kind: 'literal', value: 'stage' });
    expect(usesAppLayerModal(withArrowBeforeLayer)).toBe(false);

    const missingLayerWithArrow = '<Modal onClose={() => go(1 > 0)} footer={<Button layer="stage" />} />';
    expect(readOwnLayerAttr(jsxOpeningTags(missingLayerWithArrow, 'Modal')[0])).toBeUndefined();
    expect(usesAppLayerModal(missingLayerWithArrow)).toBe(true);

    const omittedConfirm = '<ConfirmDialog title="확인" onConfirm={() => save()} onCancel={() => close()}>내용</ConfirmDialog>';
    expect(usesAppLayerModal(omittedConfirm)).toBe(true);

    const stageConfirmWithArrow = '<ConfirmDialog onConfirm={() => save()} layer="stage" onCancel={() => close()}>내용</ConfirmDialog>';
    expect(usesAppLayerModal(stageConfirmWithArrow)).toBe(false);

    const exprAppConfirm = "<ConfirmDialog onConfirm={() => save()} layer={'app'} onCancel={() => close()} />";
    expect(usesAppLayerModal(exprAppConfirm)).toBe(true);

    expect(usesAppLayerModal('<InputDialog title="입력" onSubmit={() => {}} onCancel={() => {}} />')).toBe(true);
    expect(usesAppLayerModal('<NoticeDialog title="안내" onClose={() => {}} />')).toBe(true);
    expect(usesAppLayerModal('// <ConfirmDialog title="주석" />')).toBe(false);

    // useDialogs() 호출의 layer 생략·app·devtools·stage 판정
    expect(usesAppLayerModal("const { notice } = useDialogs(); void notice({ title: '안내', body: '내용' });")).toBe(true);
    expect(usesAppLayerModal("const { input } = useDialogs(); void input({ layer: 'app', title: '입력', label: '값', confirmLabel: '확인' });")).toBe(true);
    expect(usesAppLayerModal("const { notice, input } = useDialogs(); void notice({ layer: 'devtools', title: '안내', body: '내용' }); void input({ layer: 'devtools', title: '입력', label: '값', confirmLabel: '확인' });")).toBe(false);
    expect(usesAppLayerModal("const { confirm } = useDialogs(); void confirm({ layer: 'stage', title: '확인', body: '내용', confirmLabel: '확인' });")).toBe(false);
  });

  it('개발 도구(views/devtools)의 모달·대화상자는 모두 layer="devtools"로 열어야 한다', () => {
    const devtoolsFiles = sources.filter(f => f.path.startsWith('views/devtools/'));
    const offenders: string[] = [];
    for (const f of devtoolsFiles) {
      for (const call of dialogHookCalls(f.src)) {
        if (!call.layer || call.layer.kind !== 'literal' || call.layer.value !== 'devtools') {
          offenders.push(`${f.path}: useDialogs.${call.fn}`);
        }
      }
      for (const { name } of MODAL_LAYER_COMPONENTS) {
        for (const tag of jsxOpeningTags(f.src, name)) {
          const layer = readOwnLayerAttr(tag);
          if (!layer || layer.kind !== 'literal' || layer.value !== 'devtools') {
            offenders.push(`${f.path}: ${tag}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('사이드바 탭(views/game/tabs)과 가방 기운 얻기(EnergyPanel)는 스테이지 모달이 아니라 앱 모달(layer="app")만 사용한다', () => {
    const tabFiles = sources.filter(f => f.path.startsWith('views/game/tabs/'));
    const energyPanel = src('views/overlays/facility/EnergyPanel.tsx');
    const facilityModal = src('views/overlays/facility/FacilityModal.tsx');
    const gameTabs = src('views/game/tabs/GameTabs.tsx');
    const gameView = src('views/game/GameView.tsx');

    const offenders: string[] = [];
    for (const f of [...tabFiles, { path: 'views/overlays/facility/EnergyPanel.tsx', src: energyPanel }]) {
      for (const { name } of MODAL_LAYER_COMPONENTS) {
        for (const tag of jsxOpeningTags(f.src, name)) {
          const layer = readOwnLayerAttr(tag);
          if (layer?.kind === 'literal' && layer.value !== 'app') offenders.push(`${f.path}: ${tag}`);
          if (!layer && (name === 'Modal' || name === 'AccountModal')) offenders.push(`${f.path}: ${tag}`);
        }
      }
      for (const call of dialogHookCalls(f.src)) {
        if (call.layer?.kind === 'literal' && call.layer.value !== 'app') {
          offenders.push(`${f.path}: useDialogs.${call.fn}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    const energyModalTags = jsxOpeningTags(energyPanel, 'Modal');
    expect(energyModalTags.length).toBeGreaterThan(0);
    for (const tag of energyModalTags) {
      expect(readOwnLayerAttr(tag)).toEqual({ kind: 'literal', value: 'app' });
    }
    expect(facilityModal).not.toContain('EnergyPanel');
    expect(gameTabs).not.toContain('onOpenEnergy');
    expect(gameView).not.toContain('onOpenEnergy');
  });

  it('모바일 시트의 WindowSlot은 z-(--z-tabs)나 fixed 쌓임 맥락 바깥에 놓여 시트에서 연 앱 창이 탭 줄에 가리지 않는다', () => {
    const sidebar = src('layouts/sidebar/index.tsx');
    const slotAt = sidebar.indexOf('<WindowSlot>');
    const sectionAt = sidebar.lastIndexOf('<section', slotAt);
    expect(slotAt).toBeGreaterThan(-1);
    expect(sectionAt).toBeGreaterThan(-1);
    const sectionTag = sidebar.slice(sectionAt, sidebar.indexOf('>', sectionAt) + 1);
    expect(sectionTag).not.toContain('z-(--z-tabs)');
    expect(sectionTag).not.toMatch(/\bfixed\b/);
    expect(sectionTag).toContain('contents');
  });

  it('fixed 위치 지정은 앱 셸·모달 백드롭·시트·전환 덮개·툴팁·개발도구 화이트리스트만 허용한다', () => {
    const FIXED_WHITELIST = new Set([
      'ui/Modal.tsx',
      'ui/TooltipBubble.tsx',
      'layouts/game-stage/FerryVeil.tsx',
      'layouts/game-stage/EventZoneVeil.tsx',
      'layouts/sidebar/index.tsx',
      'views/game/GameView.tsx',
      'views/overlays/update/LoadingOverlay.tsx',
      'views/devtools/DevTools.tsx',
    ]);
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const fixedCssClass = (s: string) => {
      const quoted = [...s.matchAll(/(['"])(?:\\.|(?!\1)[^\n])*?\1/g)].map(m => m[0]);
      const templates = [...s.matchAll(/`(?:\\.|[^`\\])*`/g)].map(m => m[0].replace(/\$\{[^{}]*\}/g, ' '));
      return [...quoted, ...templates].some(chunk => /(?<![\w-])fixed(?![\w-])/.test(chunk));
    };
    expect(fixedCssClass('className={`\n  pointer-events-none\n  fixed inset-0\n`}')).toBe(true);
    expect(fixedCssClass("className={cx('min-h-0', fixed && 'flex-1')}")).toBe(false);
    expect(fixedCssClass('className="w-full table-fixed"')).toBe(false);
    const users = sources
      .filter(f => !f.path.startsWith('views/admin/'))
      .filter(f => fixedCssClass(stripComments(f.src)))
      .map(f => f.path)
      .sort();
    expect(users).toEqual([...FIXED_WHITELIST].sort());
  });

  it('FloatingToastLayer는 fixed가 아닌 absolute로 GameStageLayout 안에 놓여 사이드바와 앱 창을 가리지 않는다', () => {
    const toastSrc = src('ui/FloatingToastLayer.tsx');
    expect(toastSrc).toContain('absolute');
    expect(toastSrc).not.toMatch(/(?<![\w-])fixed(?![\w-])/);

    const gameViewSrc = src('views/game/GameView.tsx');
    const stageStart = gameViewSrc.indexOf('<GameStageLayout>');
    const stageEnd = gameViewSrc.indexOf('</GameStageLayout>');
    const toastAt = gameViewSrc.indexOf('<FloatingToastLayer');
    expect(stageStart).toBeGreaterThan(-1);
    expect(toastAt).toBeGreaterThan(stageStart);
    expect(toastAt).toBeLessThan(stageEnd);
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
