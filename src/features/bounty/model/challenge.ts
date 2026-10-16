import { CHALLENGE_ROUNDS } from '../../../game/rules/balance';
import { bountyById } from '../../../game/content/bounties';
import type { BountyQuest } from '../../../game/content/bounties';
import { namedById, namedFishOf } from '../../../game/content/named';
import type { NamedFish } from '../../../game/content/named';
import { formDiscovered } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { rodAxes } from '../../../game/rules/stats';

/** 현재 도전에서 화면에 표시할 시도 번호를 계산한다. */
export function selectChallengeAttempt(run: { hits: number; misses: number }): number {
  return Math.min(run.hits + run.misses + 1, CHALLENGE_ROUNDS);
}

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
  };
}
