import { describe, expect, it } from 'vitest';

// Vite raw glob으로 모든 src 모듈을 읽는다. 이 테스트는 src/platform/api/에 둔다.
const SOURCE_DIR = 'platform/api';
const sources = import.meta.glob('../../**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const SOURCE_ROOTS = new Set([
  'core', 'features', 'game', 'platform', 'presentation', 'shared',
]);

const ALLOWED_IMPORTS: Record<string, ReadonlySet<string>> = {
  core: new Set(['core', 'features', 'game', 'platform', 'presentation']),
  features: new Set(['features', 'game', 'platform', 'shared']),
  game: new Set(['game', 'shared']),
  platform: new Set(['game', 'platform', 'shared']),
  presentation: new Set(['features', 'game', 'presentation', 'shared']),
  shared: new Set(['shared']),
};

// Application-wide failure policy and deployment metadata remain in core during this structural move.
const CROSS_LAYER_IMPORTS = new Set([
  'features/gameplay/model/useGame.ts -> core/errors',
  'features/gameplay/model/useGame.ts -> core/buildId',
  'platform/backend/http.ts -> core/errors',
  'platform/backend/http.ts -> core/buildId',
  'platform/observability.ts -> core/version',
  'presentation/layouts/game-stage/Field.tsx -> core/errors',
  'presentation/views/admin/tabs/OpsTab.tsx -> core/version',
  'presentation/views/admin/tabs/OpsTab.tsx -> core/buildId',
  'presentation/views/game/tabs/settings/SettingsTab.tsx -> core/version',
  'presentation/views/game/tabs/settings/SettingsTab.tsx -> core/buildId',
]);

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function sourcePath(key: string): string {
  return normalize(`${SOURCE_DIR}/${key}`);
}

function isTestOrStory(path: string): boolean {
  return /\.(?:test|stories)\.tsx?$/.test(path);
}

function importedSources(path: string, src: string): string[] {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const out: string[] = [];
  const re = /(?:import\s+[^;]*?\sfrom\s*|export\s+[^;]*?\sfrom\s*|import\s*\()\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    if (!match[1].startsWith('.')) continue;
    out.push(normalize(`${dir}/${match[1]}`));
  }
  return [...new Set(out)];
}

function importedPaths(): Array<{ path: string; src: string; target: string }> {
  const out: Array<{ path: string; src: string; target: string }> = [];
  for (const [key, src] of Object.entries(sources)) {
    const path = sourcePath(key);
    for (const target of importedSources(path, src)) out.push({ path, src, target });
  }
  return out;
}

describe('src 구조 경계', () => {
  it('소스 최상위는 여섯 책임으로만 구성한다', () => {
    const roots = [...new Set(Object.keys(sources).map(key => sourcePath(key).split('/')[0]))];
    expect(roots.filter(root => !SOURCE_ROOTS.has(root))).toEqual([]);
  });

  it('기능 모듈에는 화면 컴포넌트를 두지 않는다', () => {
    const offenders = Object.keys(sources)
      .map(sourcePath)
      .filter(path => path.startsWith('features/') && path.endsWith('.tsx') && !isTestOrStory(path));
    expect(offenders).toEqual([]);
  });

  it('모듈 의존은 소유 책임의 안쪽 방향만 허용한다', () => {
    const offenders: string[] = [];
    for (const { path, target } of importedPaths()) {
      if (isTestOrStory(path)) continue;
      const from = path.split('/')[0];
      const to = target.split('/')[0];
      const edge = `${path} -> ${target}`;
      if (to && !ALLOWED_IMPORTS[from]?.has(to) && !CROSS_LAYER_IMPORTS.has(edge)) offenders.push(edge);
    }
    expect(offenders).toEqual([]);
  });

  it('backend 구현은 platform/api에서만 직접 참조한다', () => {
    const offenders = importedPaths()
      .filter(({ path, target }) => {
        const isBackend = target === 'backend' || target.startsWith('backend/')
          || target === 'platform/backend' || target.startsWith('platform/backend/');
        const isPlatformBoundary = path.startsWith('platform/api/') || path.startsWith('platform/backend/');
        return !isTestOrStory(path) && isBackend && !isPlatformBoundary;
      })
      .map(({ path, target }) => `${path} -> ${target}`);
    expect(offenders).toEqual([]);
  });

  it('game 모델은 React를 import하지 않는다', () => {
    const reactImport = /(?:from\s*|import\s*\()\s*["'](?:react|react-dom)(?:\/[^"']*)?["']/;
    const offenders = Object.entries(sources)
      .map(([key, src]) => ({ path: sourcePath(key), src }))
      .filter(({ path, src }) => path.startsWith('game/') && !isTestOrStory(path) && reactImport.test(src))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('Node 서버가 직접 읽는 game 규칙·콘텐츠의 상대 import는 .js 확장자를 쓴다', () => {
    const relativeImport = /(?:import\s+[^;]*?\sfrom\s*|export\s+[^;]*?\sfrom\s*|import\s*\()\s*["'](\.[^"']+)["']/g;
    const offenders: string[] = [];
    for (const [key, source] of Object.entries(sources)) {
      const path = sourcePath(key);
      if ((!path.startsWith('game/rules/') && !path.startsWith('game/content/')) || isTestOrStory(path)) continue;
      let match: RegExpExecArray | null;
      while ((match = relativeImport.exec(source)) !== null) {
        if (!match[1].endsWith('.js')) offenders.push(`${path} -> ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('React Query는 core와 feature model에서만 직접 사용한다', () => {
    const queryImport = /from\s*["']@tanstack\/react-query["']/;
    const offenders = Object.entries(sources)
      .map(([key, src]) => ({ path: sourcePath(key), src }))
      .filter(({ path, src }) => !isTestOrStory(path) && queryImport.test(src)
        && !path.startsWith('core/')
        && !/^features\/[^/]+\/model\//.test(path))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('화면 계층은 platform api를 직접 호출하지 않는다', () => {
    const offenders = importedPaths()
      .filter(({ path, target }) => !isTestOrStory(path)
        && path.startsWith('presentation/')
        && (target === 'platform/api' || target.startsWith('platform/api/')))
      .map(({ path, target }) => `${path} -> ${target}`);
    expect(offenders).toEqual([]);
  });

  it('의뢰 스냅샷은 platform api 또는 의뢰 모델을 통해서만 읽는다', () => {
    const directRead = /import\s+[^;]*\breadBounty\b[^;]*\bfrom\s*["']([^"']+)["']/;
    const offenders = Object.entries(sources)
      .map(([key, src]) => ({ path: sourcePath(key), src }))
      .filter(({ path, src }) => {
        if (isTestOrStory(path)) return false;
        const match = directRead.exec(src);
        if (!match) return false;
        return !path.startsWith('platform/api/') && !path.startsWith('features/bounty/model/');
      })
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
