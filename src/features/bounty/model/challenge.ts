import { ARTIFACTS } from '../../../game/content/artifacts';
import { bountyById } from '../../../game/content/bounties';
import type { BountyQuest } from '../../../game/content/bounties';
import { namedById, namedFishOf } from '../../../game/content/named';
import type { NamedFish } from '../../../game/content/named';
import { formDiscovered } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { rodAxes } from '../../../game/rules/stats';

/** 조우 창이 그릴 것 — 대상·초상화·도감 공개 여부·목격 문장·바 시간 */
export interface EncounterData {
  quest: BountyQuest;
  named: NamedFish;
  fish: ReturnType<typeof namedFishOf>;
  /** 도감에 이미 있으면 들어가며 화면부터 실루엣이 아니라 실물이다 */
  found: boolean;
  /** 수배서 첫 문장 — 목격담 */
  sighting: string;
  sweepMs: number;
  /** 결투 체력 — 이만큼 맞혀야 토벌한다 (네임드 데이터) */
  hp: number;
  /** 결투 가속 배수 — 네임드 배수 × 보유 유물 배수 */
  speedupScale: number;
}

/** 보유 유물이 결투 가속에 거는 배수 — 유물마다 (1 − 감소율)을 곱한다 */
function relicSpeedupScale(game: GameState): number {
  const owned = new Set(game.artifacts);
  return ARTIFACTS.reduce((scale, a) =>
    owned.has(a.id) ? scale * (1 - (a.effects.duelSpeedupCut ?? 0)) : scale, 1);
}

/** 추적할 네임드 의뢰의 조우 창 데이터. 네임드 의뢰가 아니면 null */
export function selectEncounter(game: GameState, questId: string): EncounterData | null {
  const quest = bountyById(questId);
  const named = quest?.targetFish ? namedById(quest.targetFish) : undefined;
  if (!quest || !named) return null;
  return {
    quest, named,
    fish: namedFishOf(named),
    found: formDiscovered(game, named.id, 'normal'),
    sighting: named.poster.split(/(?<=다\.)\s*/)[0] ?? named.poster,
    sweepMs: rodAxes(game).sweep.value * 1000,
    hp: named.hp,
    speedupScale: (named.duelSpeedup ?? 1) * relicSpeedupScale(game),
  };
}
