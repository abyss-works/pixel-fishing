import { describe, expect, it } from 'vitest';

// Vite raw glob으로 모든 src 모듈을 읽는다. 이 테스트는 src/platform/api/에 둔다.
const SOURCE_DIR = 'platform/api';
const sources = import.meta.glob('../../**/*.{ts,tsx,css}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const SOURCE_ROOT_FILES = new Set([
  'App.tsx', 'App.test.tsx', 'buildId.ts', 'index.css', 'main.tsx',
  'test-setup.ts', 'version.ts', 'version.test.ts', 'vite-env.d.ts',
]);
const SOURCE_ROOTS = new Set([
  'core', 'features', 'game', 'platform', 'presentation', 'shared',
]);

const ALLOWED_IMPORTS: Record<string, ReadonlySet<string>> = {
  'src-root': new Set(['src-root', 'core', 'features', 'game', 'platform', 'presentation', 'shared']),
  core: new Set(['core', 'platform']),
  features: new Set(['features', 'game', 'platform', 'shared']),
  game: new Set(['game', 'shared']),
  platform: new Set(['game', 'platform', 'shared']),
  presentation: new Set(['features', 'game', 'presentation', 'shared']),
  shared: new Set(['shared']),
};

// Cross-cutting failure policy stays in core; release metadata is a limited src-root dependency.
const CROSS_LAYER_IMPORTS = new Set([
  'features/gameplay/service/useGame.ts -> core/errors',
  'features/gameplay/service/useGame.ts -> buildId',
  'platform/adapters/httpGameGateway.ts -> core/errors',
  'platform/adapters/httpGameGateway.ts -> buildId',
  'platform/observability.ts -> version',
  'presentation/layouts/game-stage/Field.tsx -> core/errors',
  'presentation/views/admin/tabs/OpsTab.tsx -> version',
  'presentation/views/admin/tabs/OpsTab.tsx -> buildId',
  'presentation/views/game/tabs/settings/SettingsTab.tsx -> version',
  'presentation/views/game/tabs/settings/SettingsTab.tsx -> buildId',
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

function sourceOwner(path: string): string {
  return path.includes('/') ? path.split('/')[0] : 'src-root';
}

function isTestOrStory(path: string): boolean {
  return /\.(?:test|stories)\.tsx?$/.test(path);
}

function importedSources(path: string, src: string): string[] {
  const separator = path.lastIndexOf('/');
  const dir = separator === -1 ? '' : path.slice(0, separator);
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
  it('소스 루트는 지정 파일만 두고 디렉터리는 여섯 책임으로 구성한다', () => {
    const paths = Object.keys(sources).map(sourcePath);
    const rootFiles = paths.filter(path => !path.includes('/'));
    const roots = [...new Set(paths.filter(path => path.includes('/')).map(sourceOwner))];
    expect(rootFiles.filter(path => !SOURCE_ROOT_FILES.has(path))).toEqual([]);
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
      const from = sourceOwner(path);
      const to = sourceOwner(target);
      const edge = `${path} -> ${target}`;
      if (to && !ALLOWED_IMPORTS[from]?.has(to) && !CROSS_LAYER_IMPORTS.has(edge)) offenders.push(edge);
    }
    expect(offenders).toEqual([]);
  });

  it('platform 어댑터는 API 경계 안에서만 참조한다', () => {
    const offenders = importedPaths()
      .filter(({ path, target }) => {
        const isAdapter = target === 'platform/adapters' || target.startsWith('platform/adapters/');
        const isPlatform = path.startsWith('platform/api/') || path.startsWith('platform/adapters/');
        return !isTestOrStory(path) && isAdapter && !isPlatform;
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

  it('React Query는 core와 feature service에서만 직접 사용한다', () => {
    const queryImport = /from\s*["']@tanstack\/react-query["']/;
    const offenders = Object.entries(sources)
      .map(([key, src]) => ({ path: sourcePath(key), src }))
      .filter(({ path, src }) => !isTestOrStory(path) && queryImport.test(src)
        && !path.startsWith('core/')
        && !/^features\/[^/]+\/service\//.test(path))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('화면 계층은 platform API와 어댑터를 직접 호출하지 않는다', () => {
    const offenders = importedPaths()
      .filter(({ path, target }) => !isTestOrStory(path)
        && path.startsWith('presentation/')
        && (target === 'platform/api' || target.startsWith('platform/api/')
          || target === 'platform/adapters' || target.startsWith('platform/adapters/')))
      .map(({ path, target }) => `${path} -> ${target}`);
    expect(offenders).toEqual([]);
  });

  it('의뢰 스냅샷은 platform API 또는 의뢰 service를 통해서만 읽는다', () => {
    const directRead = /import\s+[^;]*\breadBounty\b[^;]*\bfrom\s*["']([^"']+)["']/;
    const offenders = Object.entries(sources)
      .map(([key, src]) => ({ path: sourcePath(key), src }))
      .filter(({ path, src }) => {
        if (isTestOrStory(path)) return false;
        const match = directRead.exec(src);
        if (!match) return false;
        return !path.startsWith('platform/api/') && !path.startsWith('features/bounty/service/');
      })
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
