// 개발 도구 프리셋 — 어려운 조건을 한 번에 만드는 명령 묶음.
// 네임드 직전 프리셋은 네임드 의뢰마다(항구 자동 이동 포함), 교환 직전 프리셋은 유물마다,
// QA 패키지 프리셋은 신콘텐츠/구역 검수용 상태를 한 번에 세팅한다.
import type { GameAction } from '../../../game/rules/actions';
import type { GameState } from '../../../game/rules/logic';
import type { DebugCommandId } from '../../../game/rules/debug';
import { minLevelOfPower } from '../../../game/rules/stats';
import { boatAt } from '../../../game/content/boats';
import type { Artifact } from '../../../game/content/artifacts';
import { ARTIFACTS } from '../../../game/content/artifacts';
import { BOUNTIES, portOfZone } from '../../../game/content/bounties';
import type { BountyQuest, BountyZone } from '../../../game/content/bounties';
import { ENERGY_ITEM_IDS } from '../../../game/content/cooking';
import type { BaseId } from '../../../game/content/places';
import { namedById } from '../../../game/content/named';
import { SPOTS } from '../../../game/content/spots';
import { topZoneOfSpot, zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';

export type PresetStep =
  | { kind: 'debug'; command: DebugCommandId; args: Record<string, unknown> }
  | { kind: 'action'; action: GameAction }
  | { kind: 'teleportBase'; base: BaseId }
  | { kind: 'armEncounter' };

export interface PresetContext { game: GameState }

export interface DevPreset {
  id: string;
  label: string;
  hint: string;
  zone: ZoneId | 'all';
  tags: readonly string[];
  plan: (ctx: PresetContext) => PresetPlan;
}

export type PresetPlan = { ok: true; steps: PresetStep[] } | { ok: false; blocked: string };

/** 구역 수역 전부에서 낚을 수 있는 배·낚싯대 — 수역 표의 요구치가 정본이다 */
function zoneGear(zone: BountyZone): { boat: number; rod: number } {
  const spots = SPOTS.filter(s => topZoneOfSpot(s.id) === zone);
  return {
    boat: Math.max(0, ...spots.map(s => s.boatTier)),
    rod: minLevelOfPower(Math.max(0, ...spots.map(s => s.powerReq ?? 0))),
  };
}

const debugStep = (command: DebugCommandId, args: Record<string, unknown> = {}): PresetStep =>
  ({ kind: 'debug', command, args });

function namedReady(quest: BountyQuest): DevPreset {
  const zone = quest.zone;
  const area = zoneById(zone)?.shortName ?? zone;
  const name = namedById(quest.targetFish ?? '')?.name ?? quest.id;
  return {
    id: `named-ready:${quest.id}`,
    label: `${name} 네임드 직전`,
    hint: `${area} 항구로 이동해 클리어·진행·흔적을 정리하고 도감을 채운 뒤 네임드를 수주하고 강제 조우를 건다.`,
    zone,
    tags: ['네임드', name, area],
    plan: ({ game }) => {
      const port = portOfZone(zone);
      if (!port) return { ok: false, blocked: `${area}에는 수배 창구가 없다.` };
      const gear = zoneGear(zone);
      return {
        ok: true,
        steps: [
          debugStep('bounty.resetToday'),
          debugStep('bounty.clearProgress'),
          debugStep('bounty.clearTickets'),
          debugStep('stats.set', {
            fame: Math.max(game.fame, boatAt(gear.boat)?.fameReq ?? 0),
            boat: Math.max(game.boat, gear.boat),
            rod: Math.max(game.rod, gear.rod),
          }),
          debugStep('dex.completeZone', { zone }),
          { kind: 'teleportBase', base: port },
          { kind: 'action', action: { type: 'acceptQuest', questId: quest.id, port } },
          { kind: 'armEncounter' },
        ],
      };
    },
  };
}

function relicReady(artifact: Artifact): DevPreset {
  const area = zoneById(artifact.zone)?.shortName ?? artifact.zone;
  return {
    id: `relic-ready:${artifact.id}`,
    label: `${artifact.name} 교환 직전`,
    hint: `${artifact.materialName} 1개를 지급한다.`,
    zone: artifact.zone,
    tags: ['유물', artifact.name, artifact.materialName, area],
    plan: () => ({ ok: true, steps: [debugStep('bounty.grantMaterial', { artifact: artifact.id })] }),
  };
}

const QA_PRESETS: readonly DevPreset[] = [
  {
    id: 'qa-v020-package',
    label: 'v0.20.0 신콘텐츠 QA 패키지',
    hint: '배 9단계·낚싯대 Lv65·골드 10억·기운 4종·요리·북대서양 도감 채우기 후 리스본항으로 이동한다.',
    zone: 'northatlantic',
    tags: ['v0.20.0', '북대서양', '리스본', '아조레스', '버뮤다', 'QA', '신콘텐츠'],
    plan: ({ game }) => ({
      ok: true,
      steps: [
        debugStep('stats.set', {
          gold: Math.max(game.gold, 1_000_000_000),
          fame: Math.max(game.fame, boatAt(9)?.fameReq ?? 0),
          boat: Math.max(game.boat, 9),
          rod: Math.max(game.rod, 65),
        }),
        debugStep('dex.fill', { zone: 'northatlantic', form: 'both', big: true, includeNamed: true }),
        debugStep('items.grant', { itemId: ENERGY_ITEM_IDS.common, count: 2000 }),
        debugStep('items.grant', { itemId: ENERGY_ITEM_IDS.rare, count: 500 }),
        debugStep('items.grant', { itemId: ENERGY_ITEM_IDS.epic, count: 200 }),
        debugStep('items.grant', { itemId: ENERGY_ITEM_IDS.legendary, count: 100 }),
        debugStep('items.grant', { itemId: 'cook-bait-night', count: 5 }),
        debugStep('items.grant', { itemId: 'cook-bait-mutation', count: 5 }),
        debugStep('items.grant', { itemId: 'cook-lunch-named', count: 5 }),
        { kind: 'teleportBase', base: 'lisbon' },
      ],
    }),
  },
  {
    id: 'qa-southatlantic-package',
    label: '남대서양(1-5) QA 패키지',
    hint: '배 8단계·낚싯대 Lv55·골드 5억·남대서양 도감을 세팅하고 월비스베이항으로 이동한다.',
    zone: 'southatlantic',
    tags: ['남대서양', '월비스베이', '용승대', '세인트헬레나', 'QA'],
    plan: ({ game }) => ({
      ok: true,
      steps: [
        debugStep('stats.set', {
          gold: Math.max(game.gold, 500_000_000),
          fame: Math.max(game.fame, boatAt(8)?.fameReq ?? 0),
          boat: Math.max(game.boat, 8),
          rod: Math.max(game.rod, 55),
        }),
        debugStep('dex.fill', { zone: 'southatlantic', form: 'both', big: true, includeNamed: true }),
        { kind: 'teleportBase', base: 'walvisbay' },
      ],
    }),
  },
  {
    id: 'qa-cooking-full',
    label: '요리·기운 풀 세팅',
    hint: '요리 해금(배 5단계)·기운 4종·대표 도시락/미끼를 채우고 집으로 이동한다.',
    zone: 'indian',
    tags: ['요리', '기운', '부엌', '미끼', '도시락', '달빛'],
    plan: ({ game }) => ({
      ok: true,
      steps: [
        debugStep('stats.set', {
          gold: Math.max(game.gold, 10_000_000),
          fame: Math.max(game.fame, boatAt(5)?.fameReq ?? 0),
          boat: Math.max(game.boat, 5),
          rod: Math.max(game.rod, 30),
        }),
        debugStep('items.grant', { itemId: ENERGY_ITEM_IDS.common, count: 3000 }),
        debugStep('items.grant', { itemId: ENERGY_ITEM_IDS.rare, count: 500 }),
        debugStep('items.grant', { itemId: ENERGY_ITEM_IDS.epic, count: 200 }),
        debugStep('items.grant', { itemId: ENERGY_ITEM_IDS.legendary, count: 100 }),
        debugStep('items.grant', { itemId: 'cook-lunch-bite', count: 3 }),
        debugStep('items.grant', { itemId: 'cook-bait-night', count: 3 }),
        debugStep('items.grant', { itemId: 'cook-bait-legendary', count: 3 }),
        { kind: 'teleportBase', base: 'home' },
      ],
    }),
  },
  {
    id: 'qa-dex-complete-all',
    label: '전 구역 도감·네임드·유물 완주',
    hint: '전체 120종 일반/돌연변이(대어)·네임드 8종·유물 8종 Lv5를 한 번에 연다.',
    zone: 'all',
    tags: ['도감', '돌연변이', '네임드', '유물', '업적', '전체'],
    plan: () => ({
      ok: true,
      steps: [
        debugStep('dex.fill', { zone: 'all', form: 'both', big: true, includeNamed: true }),
        debugStep('named.unlock', { namedId: 'all' }),
        debugStep('artifact.set', { artifact: 'all', level: 5 }),
      ],
    }),
  },
  {
    id: 'qa-village-complete',
    label: '마을 도감(일반+변이) 완주',
    hint: '마을 12종의 일반·돌연변이(대어) 도감을 채우고 집으로 이동한다.',
    zone: 'village',
    tags: ['마을', '연못', '강', '도감'],
    plan: () => ({
      ok: true,
      steps: [
        debugStep('dex.fill', { zone: 'village', form: 'both', big: true }),
        { kind: 'teleportBase', base: 'home' },
      ],
    }),
  },
];

export const DEV_PRESETS: readonly DevPreset[] = [
  ...QA_PRESETS,
  ...BOUNTIES.filter(q => q.difficulty === 'named').map(namedReady),
  ...ARTIFACTS.map(relicReady),
];

export const planPreset = (preset: DevPreset, ctx: PresetContext): PresetPlan => preset.plan(ctx);

/** 검색어와 구역 필터로 프리셋을 거른다 */
export function filterPresets(
  presets: readonly DevPreset[], query: string, zone: string,
): DevPreset[] {
  const q = query.trim().toLowerCase();
  return presets.filter(p => {
    if (zone !== 'all' && p.zone !== 'all' && p.zone !== zone) return false;
    if (!q) return true;
    return p.label.toLowerCase().includes(q)
      || p.hint.toLowerCase().includes(q)
      || p.tags.some(t => t.toLowerCase().includes(q));
  });
}
