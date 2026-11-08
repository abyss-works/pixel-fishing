// 개발 도구 프리셋 — 어려운 조건을 한 번에 만드는 명령 묶음. 수배 구역마다 표에서 만든다.
// 수주는 실제 acceptQuest 액션으로 보내 일일 의뢰 해시·라이선스 판정을 그대로 통과시킨다.
import type { GameAction } from '../../../game/rules/actions';
import type { GameState } from '../../../game/rules/logic';
import type { DebugCommandId } from '../../../game/rules/debug';
import { minLevelOfPower } from '../../../game/rules/stats';
import { boatAt } from '../../../game/content/boats';
import type { Artifact } from '../../../game/content/artifacts';
import { ARTIFACTS } from '../../../game/content/artifacts';
import { BOUNTIES, portOfZone } from '../../../game/content/bounties';
import type { BountyQuest, BountyZone } from '../../../game/content/bounties';
import { namedById } from '../../../game/content/named';
import { SPOTS } from '../../../game/content/spots';
import { topZoneOfSpot, zoneById } from '../../../game/content/zones';

export type PresetStep =
  | { kind: 'debug'; command: DebugCommandId; args: Record<string, unknown> }
  | { kind: 'action'; action: GameAction }
  | { kind: 'armEncounter' };

export interface PresetContext { game: GameState; uid: string; day: string }

export interface DevPreset {
  id: string;
  label: string;
  hint: string;
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
    hint: '클리어 기록·진행·흔적을 정리하고 도감을 채운 뒤 네임드를 수주하고 강제 조우를 건다.',
    plan: ({ game }) => {
      const port = portOfZone(zone);
      if (!port) return { ok: false, blocked: `${area}에는 수배 창구가 없다.` };
      if (game.location.kind !== 'base' || game.location.id !== port) {
        return { ok: false, blocked: `${area} 항구 안에서 실행해야 한다 (수주는 수배판 위치를 요구한다).` };
      }
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
          { kind: 'action', action: { type: 'acceptQuest', questId: quest.id, port } },
          { kind: 'armEncounter' },
        ],
      };
    },
  };
}

function relicReady(artifact: Artifact): DevPreset {
  return {
    id: `relic-ready:${artifact.id}`,
    label: `${artifact.name} 교환 직전`,
    hint: '유물의 교환 재료를 1개 준다.',
    plan: () => ({ ok: true, steps: [debugStep('bounty.grantMaterial', { artifact: artifact.id })] }),
  };
}

export const DEV_PRESETS: readonly DevPreset[] = [
  ...BOUNTIES.filter(q => q.difficulty === 'named').map(namedReady),
  ...ARTIFACTS.map(relicReady),
];

export const planPreset = (preset: DevPreset, ctx: PresetContext): PresetPlan => preset.plan(ctx);
