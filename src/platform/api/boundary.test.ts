import { describe, expect, it } from 'vitest';

// Vite raw glob으로 모든 src 모듈을 읽는다. 이 테스트는 플랫폼 계층에 둔다.
const SOURCE_DIR = 'platform/api';
const sources = import.meta.glob('../../**/*.{ts,tsx,css}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const SOURCE_ROOT_FILES = new Set([
  'admin.tsx', 'App.tsx', 'App.test.tsx', 'boot.tsx', 'buildId.ts', 'index.css', 'main.tsx',
  'test-setup.ts', 'version.ts', 'version.test.ts', 'vite-env.d.ts',
]);
const SOURCE_ROOTS = new Set([
  'core', 'features', 'game', 'platform', 'presentation', 'shared',
]);
const CONCERN_DIRS: Record<string, ReadonlySet<string>> = {
  game: new Set(['content', 'rendering', 'rules', 'runtime', 'world']),
  platform: new Set(['adapters', 'api']),
  presentation: new Set(['layouts', 'ui', 'views']),
  shared: new Set(['lib']),
};
const FEATURE_CONCERN_DIRS = new Set(['model', 'service']);

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
  'features/gameplay/service/rateLimitRetry.ts -> core/errors',
  'features/gameplay/service/useGame.ts -> buildId',
  'features/announcements/service/whatsNew.ts -> version',
  'platform/adapters/me.ts -> core/errors',
  'platform/adapters/requestFailure.ts -> core/errors',
  'platform/adapters/mailbox.ts -> core/errors',
  'platform/adapters/friends.ts -> core/errors',
  'platform/adapters/guild.ts -> core/errors',
  'platform/adapters/httpGameGateway.ts -> core/errors',
  'platform/adapters/httpGameGateway.ts -> buildId',
  'platform/adapters/httpGameGateway.ts -> version',
  'platform/adapters/live.ts -> core/errors',
  'platform/adapters/live.ts -> buildId',
  'platform/adapters/live.ts -> version',
  'platform/observability.ts -> version',
  'presentation/layouts/game-stage/Field.tsx -> core/errors',
  'presentation/views/admin/tabs/OpsTab.tsx -> version',
  'presentation/views/admin/tabs/OpsTab.tsx -> buildId',
  'presentation/views/game/tabs/settings/SettingsTab.tsx -> version',
  'presentation/views/game/tabs/settings/SettingsTab.tsx -> buildId',
]);

// 표현 계층이 게임 규칙·콘텐츠에서 직접 import해도 되는 값 심볼 예외(거부 문구, 스프라이트·렌더 데이터)
const ALLOWED_PRESENTATION_GAME_VALUE_SYMBOLS = new Set([
  'REJECT_TEXT',
  'BOAT_PALETTE',
  'BOAT_SPRITES',
  'GEAR_PALETTE',
  'OUTLINE_DARK',
  'ROD_SPRITE',
  'SPRITE_TARGETS',
  'itemSprite',
]);

// 표현 계층의 기존 게임 값 심볼 import 목록 — 새 위반이 추가되거나 해결된 항목이 남아 있으면 실패한다.
const INITIAL_PRESENTATION_GAME_VALUE_IMPORTS: Record<string, readonly string[]> = {
  'presentation/layouts/game-stage/Base.tsx': ['boatNameOf'],
  'presentation/layouts/game-stage/Field.tsx': ['FISH', 'RARITY', 'SPOTS', 'boatGateText', 'formName', 'nextBoatText', 'zoneById'],
  'presentation/ui/SizeBar.tsx': ['BIG_CATCH_PERCENTILE'],
  'presentation/ui/artifactEffects.ts': ['MUTATION_WEIGHTS', 'artifactEffectsAt', 'artifactExtraCookChanceAt'],
  'presentation/ui/fish/InstanceLine.tsx': ['sizePercentile'],
  'presentation/ui/fish/RarityTag.tsx': ['DISPLAY_GRADE', 'RARITY'],
  'presentation/ui/hud/CatchCard.tsx': ['RARITY', 'formName', 'priceOf'],
  'presentation/ui/hud/Minimap.tsx': ['topZoneOf', 'zoneById', 'zoneOfSpot'],
  'presentation/views/admin/tabs/BalanceLiveSection.tsx': ['SPOTS', 'boatNameOf'],
  'presentation/views/admin/tabs/FishTab.tsx': ['FISH', 'RARITY', 'SPOTS'],
  'presentation/views/admin/tabs/UsersTab.tsx': ['boatNameOf'],
  'presentation/views/devtools/TimeControl.tsx': ['DAY_START_MIN', 'NIGHT_START_MIN', 'dayPhase', 'formatGameClock'],
  'presentation/views/game/GameView.tsx': ['zoneById'],
  'presentation/views/game/base-menu/BaseMenu.tsx': ['boatNameOf'],
  'presentation/views/game/tabs/GameTabs.tsx': ['ZONE_IDS', 'defaultZoneOfRegion'],
  'presentation/views/game/tabs/bag/BagTab.tsx': ['ARTIFACTS', 'EXHIBIT_SLOTS', 'formName', 'freeExhibitSlot', 'instanceFish'],
  'presentation/views/game/tabs/bag/ItemSection.tsx': ['formatEnergy'],
  'presentation/views/game/tabs/dex/DexGrid.tsx': ['zoneById'],
  'presentation/views/game/tabs/dex/NamedDetail.tsx': ['zoneById'],
  'presentation/views/game/tabs/dex/VDexNamed.tsx': ['zoneById'],
  'presentation/views/game/tabs/help/VHelp.tsx': [
    'BIG_CATCH_PERCENTILE', 'BOATS', 'BOUNTY_DAILY_CAP', 'BOUNTY_NAMED_DAILY_CAP',
    'CHALLENGE_MISS_LIMIT', 'GAME_DAY_RESET_TEXT', 'TICKET_EXPIRY_TEXT',
    'VARIANT_PRICE_MULT', 'WALK_BAG_CAP', 'variantShare',
  ],
  'presentation/views/game/tabs/region/VRegion.tsx': ['RARITY', 'RARITY_ORDER', 'zoneControls', 'zoneTips'],
  'presentation/views/overlays/account/MyInfoModal.tsx': ['checkNickname'],
  'presentation/views/overlays/achievements/AchievementCard.tsx': ['DEFAULT_LOOK', 'hatById'],
  'presentation/views/overlays/achievements/AchievementsModal.tsx': ['hatById'],
  'presentation/views/overlays/away/AwayReportModal.tsx': ['FISH', 'awayTips', 'formName', 'spotById'],
  'presentation/views/overlays/away/awayText.ts': ['boatNameOf'],
  'presentation/views/overlays/bounty/BountyPanel.tsx': ['zoneById'],
  'presentation/views/overlays/bounty/EncounterModal.tsx': ['CHALLENGE_MISS_LIMIT', 'CHALLENGE_YELLOW', 'newChallenge', 'strikeChallenge'],
  'presentation/views/overlays/bounty/RelicCard.tsx': ['artifactHasLevel'],
  'presentation/views/overlays/bounty/boardParts.tsx': ['GAME_DAY_RESET_TEXT'],
  'presentation/views/overlays/facility/BoatPanel.tsx': ['AUTO_ENERGY_BOAT'],
  'presentation/views/overlays/facility/EnergyTab.tsx': ['formatEnergy'],
  'presentation/views/overlays/facility/FacilityModal.tsx': ['hatById', 'isBountyPort'],
  'presentation/views/overlays/facility/RecipeTab.tsx': ['RARITY', 'formatEnergy'],
  'presentation/views/overlays/ferry/FerryModal.tsx': ['fastTravelTargets', 'zoneById'],
  'presentation/views/overlays/guild/GuildManageTab.tsx': ['GUILD_JOIN_MODES', 'checkGuildName'],
  'presentation/views/overlays/guild/GuildModal.tsx': ['GUILD_MAX_MEMBERS'],
  'presentation/views/overlays/guild/GuildSkillsTab.tsx': ['applyDonation'],
  'presentation/views/overlays/guild/NoGuild.tsx': ['GUILD_MAX_MEMBERS', 'joinRequestDaysLeft', 'normalizeGuildCode'],
  'presentation/views/overlays/letter/LetterModal.tsx': ['LETTER_MAX'],
  'presentation/views/overlays/live/ChatBar.tsx': ['CHAT_MAX_LENGTH'],
  'presentation/views/overlays/patchnotes/PatchNotesModal.tsx': ['PATCH_NOTES'],
  'presentation/views/overlays/stats/BoatTab.tsx': ['boatNameOf'],
  'presentation/views/overlays/stats/RodStatTable.tsx': ['POWER_RULES', 'autoPenaltyHelpText'],
  'presentation/views/overlays/stats/RodTab.tsx': ['boatNameOf'],
  'presentation/views/overlays/stats/StatsModal.tsx': ['powerHelpText'],
  'presentation/views/overlays/tutorial/TutorialModal.tsx': ['BOUNTY_DAILY_CAP', 'CHALLENGE_MISS_LIMIT', 'GAME_DAY_RESET_TEXT', 'TICKET_EXPIRY_TEXT'],
  'presentation/views/overlays/wardrobe/WardrobePanel.tsx': ['HATS', 'LOOK_PRESETS', 'PANTS_COLORS', 'SHIRT_COLORS', 'hatById'],
  'presentation/views/overlays/whats-new/FishArtPreview.tsx': ['FISH'],
  'presentation/views/overlays/whats-new/NewsStep.tsx': ['NOTE_TAGS'],
};

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

function isTestFile(path: string): boolean {
  return /\.test\.tsx?$/.test(path);
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

  it('각 책임 계층의 하위 모듈은 문서화된 관심사 폴더에 둔다', () => {
    const offenders = Object.keys(sources).map(sourcePath).filter(path => {
      const parts = path.split('/');
      const owner = sourceOwner(path);
      if (owner === 'src-root') return false;
      if (owner === 'core') return parts.length !== 2;
      if (owner === 'features') return !FEATURE_CONCERN_DIRS.has(parts[2] ?? '');
      if (path === 'platform/observability.ts') return false;
      return !CONCERN_DIRS[owner]?.has(parts[1] ?? '');
    });
    expect(offenders).toEqual([]);
  });

  it('기능 모듈에는 화면 컴포넌트를 두지 않는다', () => {
    const offenders = Object.keys(sources)
      .map(sourcePath)
      .filter(path => path.startsWith('features/') && path.endsWith('.tsx') && !isTestFile(path));
    expect(offenders).toEqual([]);
  });

  it('기능 모델은 React를 참조하지 않는다', () => {
    const reactImport = /(?:from\s*|import\s*\()\s*["'](?:react|react-dom)(?:\/[^"']*)?["']/;
    const offenders = Object.entries(sources)
      .map(([key, src]) => ({ path: sourcePath(key), src }))
      .filter(({ path, src }) => /^features\/[^/]+\/model\//.test(path)
        && !isTestFile(path) && reactImport.test(src))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('모듈 의존은 소유 책임의 안쪽 방향만 허용한다', () => {
    const offenders: string[] = [];
    for (const { path, target } of importedPaths()) {
      if (isTestFile(path)) continue;
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
        return !isTestFile(path) && isAdapter && !isPlatform;
      })
      .map(({ path, target }) => `${path} -> ${target}`);
    expect(offenders).toEqual([]);
  });

  it('game 모델은 React를 import하지 않는다', () => {
    const reactImport = /(?:from\s*|import\s*\()\s*["'](?:react|react-dom)(?:\/[^"']*)?["']/;
    const offenders = Object.entries(sources)
      .map(([key, src]) => ({ path: sourcePath(key), src }))
      .filter(({ path, src }) => path.startsWith('game/') && !isTestFile(path) && reactImport.test(src))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('게임 스테이지 호스트는 시뮬레이션과 프레임 루프를 게임 런타임에 위임한다', () => {
    const hostPath = 'presentation/layouts/game-stage/Field.tsx';
    const enginePath = 'game/runtime/fieldEngine.ts';
    const host = Object.entries(sources).find(([key]) => sourcePath(key) === hostPath)?.[1] ?? '';
    const runtime = Object.keys(sources).map(sourcePath);
    const executable = host.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const engineImport = importedSources(hostPath, host);

    expect(runtime).toContain(enginePath);
    expect(engineImport).toContain('game/runtime/fieldEngine');
    expect(executable).not.toMatch(/requestAnimationFrame|cancelAnimationFrame|setTimeout|nextPhase|phaseDurationMs|movePlayer|ZoneTracker/);
  });

  it('Node 서버가 직접 읽는 game 규칙·콘텐츠의 상대 import는 .js 확장자를 쓴다', () => {
    const relativeImport = /(?:import\s+[^;]*?\sfrom\s*|export\s+[^;]*?\sfrom\s*|import\s*\()\s*["'](\.[^"']+)["']/g;
    const offenders: string[] = [];
    for (const [key, source] of Object.entries(sources)) {
      const path = sourcePath(key);
      if ((!path.startsWith('game/rules/') && !path.startsWith('game/content/')) || isTestFile(path)) continue;
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
      .filter(({ path, src }) => !isTestFile(path) && queryImport.test(src)
        && !path.startsWith('core/')
        && !/^features\/[^/]+\/service\//.test(path))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('화면 계층은 platform API와 어댑터를 직접 호출하지 않는다', () => {
    const offenders = importedPaths()
      .filter(({ path, target }) => !isTestFile(path)
        && path.startsWith('presentation/')
        && (target === 'platform/api' || target.startsWith('platform/api/')
          || target === 'platform/adapters' || target.startsWith('platform/adapters/')))
      .map(({ path, target }) => `${path} -> ${target}`);
    expect(offenders).toEqual([]);
  });

  it('브라우저 코드는 관리자 뷰와 RPC를 직접 읽지 않고 서버 읽기 함수에 맡긴다', () => {
    // 뷰 이름(v_*)과 RPC 호출이 주석을 뺀 코드에 없어야 한다
    const direct = /\bv_[a-z0-9_]+\b|\.rpc\(/;
    const offenders = Object.entries(sources)
      .map(([key, src]) => ({ path: sourcePath(key), code: src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '') }))
      .filter(({ path, code }) => !isTestFile(path) && direct.test(code))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('의뢰 스냅샷은 platform API 또는 의뢰 service를 통해서만 읽는다', () => {
    const directRead = /import\s+[^;]*\breadBounty\b[^;]*\bfrom\s*["']([^"']+)["']/;
    const offenders = Object.entries(sources)
      .map(([key, src]) => ({ path: sourcePath(key), src }))
      .filter(({ path, src }) => {
        if (isTestFile(path)) return false;
        const match = directRead.exec(src);
        if (!match) return false;
        return !path.startsWith('platform/api/') && !path.startsWith('features/bounty/service/');
      })
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('표현 계층은 허용 예외 밖의 game 규칙·콘텐츠 값 심볼을 새로 import하지 않고 해결된 항목은 제거한다', () => {
    const importRe = /\bimport\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
    const actual: Record<string, string[]> = {};

    for (const [key, raw] of Object.entries(sources)) {
      const path = sourcePath(key);
      if (!path.startsWith('presentation/') || isTestFile(path) || !/\.tsx?$/.test(path)) continue;
      const dir = path.slice(0, path.lastIndexOf('/'));
      const code = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      const syms = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = importRe.exec(code)) !== null) {
        const clause = match[1].trim();
        const spec = match[2];
        if (!spec.startsWith('.') || /^type\b/.test(clause)) continue;
        const target = normalize(`${dir}/${spec}`).replace(/\.js$/, '');
        const isGameRuleOrContent = target === 'game/rules' || target.startsWith('game/rules/')
          || target === 'game/content' || target.startsWith('game/content/');
        if (!isGameRuleOrContent) continue;

        const defaultMatch = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause);
        if (defaultMatch && !ALLOWED_PRESENTATION_GAME_VALUE_SYMBOLS.has(defaultMatch[1])) {
          syms.add(defaultMatch[1]);
        }
        const nsMatch = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
        if (nsMatch) syms.add(`* as ${nsMatch[1]}`);
        const namedMatch = /\{([\s\S]*?)\}/.exec(clause);
        if (namedMatch) {
          for (const part of namedMatch[1].split(',')) {
            const item = part.trim();
            if (!item || /^type\s+/.test(item)) continue;
            const name = item.split(/\s+as\s+/)[0].trim();
            if (name && !ALLOWED_PRESENTATION_GAME_VALUE_SYMBOLS.has(name)) syms.add(name);
          }
        }
      }
      if (syms.size > 0) actual[path] = [...syms].sort();
    }

    const added: string[] = [];
    const stale: string[] = [];
    const allPaths = new Set([...Object.keys(actual), ...Object.keys(INITIAL_PRESENTATION_GAME_VALUE_IMPORTS)]);
    for (const path of [...allPaths].sort()) {
      const got = new Set(actual[path] ?? []);
      const expected = new Set(INITIAL_PRESENTATION_GAME_VALUE_IMPORTS[path] ?? []);
      for (const sym of [...got].sort()) {
        if (!expected.has(sym)) added.push(`${path}: ${sym}`);
      }
      for (const sym of [...expected].sort()) {
        if (!got.has(sym)) stale.push(`${path}: ${sym}`);
      }
    }
    expect(added).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('효과 규칙 모듈의 공개 함수 시그니처에 효과 기본값을 두지 않는다', () => {
    const effectsSrc = Object.entries(sources).find(([key]) => sourcePath(key) === 'game/rules/effects.ts')?.[1] ?? '';
    expect(effectsSrc.length).toBeGreaterThan(0);

    const code = effectsSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const forbiddenDefault = /=\s*(?:0|NO_GUILD_EFFECTS|NO_COOK_EFFECTS|NO_ACHIEVEMENT_BONUSES)\b/;
    const fnPatterns = [
      /export\s+function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g,
      /export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?::[^=]+)?=>/g,
    ];
    const offenders: string[] = [];
    let inspected = 0;
    for (const re of fnPatterns) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(code)) !== null) {
        inspected++;
        if (forbiddenDefault.test(match[2])) offenders.push(`${match[1]}(${match[2].trim()})`);
      }
    }
    expect(inspected).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
