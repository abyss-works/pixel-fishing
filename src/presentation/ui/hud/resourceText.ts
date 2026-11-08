import type { GameState } from '../../../game/rules/logic';
import { selectBagStatus, selectGearSummary } from '../../../features/inventory/model/selectors';
import { fmtLevel, fmtNum, fmtRatio } from '../format';

// 자원 바의 칸 문구 - 칸의 툴팁과 버튼의 접근성 이름이 같은 문구를 쓰도록 한 곳에서 만든다.
// 배 칸의 화면 값(boatValue)은 티어라 이름이 보이지 않으므로, 이름은 툴팁(boat)과 접근성 이름이 맡는다.
export function resourceText(game: GameState, bagBonus = 0) {
  const bag = selectBagStatus(game, bagBonus);
  const gear = selectGearSummary(game);
  const text = {
    gold: `골드 ${fmtNum(game.gold)}`,
    fame: `명성 ${fmtNum(game.fame)}`,
    boat: `배 ${gear.boatName}`,
    rod: `낚싯대 ${fmtLevel(gear.rodLevel)}`,
    bag: `가방 ${fmtRatio(bag.count, bag.cap)} (${bag.percent}%)`,
  };
  return {
    ...text,
    boatName: gear.boatName,
    boatValue: fmtLevel(gear.boatTier),
    rodValue: fmtLevel(gear.rodLevel),
    summary: Object.values(text).join(', '),
  };
}
