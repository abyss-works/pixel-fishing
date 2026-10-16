// 개발 도구 프리셋 — 어려운 조건을 한 번에 만드는 명령 묶음. 수배 구역마다 표에서 만든다.
// 수주는 실제 acceptQuest 액션으로 보내 일일 의뢰 해시·라이선스 판정을 그대로 통과시킨다.
import type { GameAction } from '../../../game/rules/actions';
import type { GameState } from '../../../game/rules/logic';
import { DEBUG_ZONES } from '../../../game/rules/debug';
import type { DebugCommandId } from '../../../game/rules/debug';
import { minLevelOfPower } from '../../../game/rules/stats';
import { BOUNTY_LICENSE_FAME, BOUNTY_PORT_ZONE, dailyQuestFor } from '../../../game/content/bounties';
import type { BountyPort, BountyZone } from '../../../game/content/bounties';
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

const portOfZone = (zone: BountyZone): BountyPort =>
  (Object.keys(BOUNTY_PORT_ZONE) as BountyPort[]).find(port => BOUNTY_PORT_ZONE[port] === zone)!;

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

function namedReady(zone: BountyZone): DevPreset {
  const area = zoneById(zone)?.shortName ?? zone;
  return {
    id: `named-ready:${zone}`,
    label: `${area} 네임드 직전`,
    hint: '수주 기록·진행·흔적을 정리하고 라이선스 조건을 채운 뒤 네임드를 수주하고 강제 조우를 건다.',
    plan: ({ game, uid, day }) => {
      const port = portOfZone(zone);
      if (game.location.kind !== 'base' || game.location.id !== port) {
        return { ok: false, blocked: `${area} 항구 안에서 실행해야 한다 (수주는 수배판 위치를 요구한다).` };
      }
      const quest = dailyQuestFor(zone, 'named', uid, day);
      if (!quest) return { ok: false, blocked: `${area}에는 네임드 의뢰가 없다.` };
      const gear = zoneGear(zone);
      return {
        ok: true,
        steps: [
          debugStep('bounty.resetToday'),
          debugStep('bounty.clearProgress'),
          debugStep('bounty.clearTickets'),
          debugStep('stats.set', {
            fame: Math.max(game.fame, BOUNTY_LICENSE_FAME[zone]),
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

function relicReady(zone: BountyZone): DevPreset {
  const area = zoneById(zone)?.shortName ?? zone;
  return {
    id: `relic-ready:${zone}`,
    label: `${area} 유물 교환 직전`,
    hint: '구역 유물의 교환 재료를 1개 준다.',
    plan: () => ({ ok: true, steps: [debugStep('bounty.grantMaterial', { zone })] }),
  };
}

export const DEV_PRESETS: readonly DevPreset[] = [
  ...DEBUG_ZONES.map(namedReady),
  ...DEBUG_ZONES.map(relicReady),
];

export const planPreset = (preset: DevPreset, ctx: PresetContext): PresetPlan => preset.plan(ctx);
