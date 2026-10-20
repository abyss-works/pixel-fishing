// 새 계정 진행 시뮬레이션 — 열린 해역 중 가장 뒤 해역에서 낚고, 다음 해역에 필요한 배·강화를 살 수 있으면 바로 산다.
// 누적 도달 시간, 첫 세션 도달점, 해역 전환마다 무엇(골드·명성)을 기다렸는지를 잰다.
// 가정: 판매는 즉시(이동·판매 왕복 없음), 쿠폰·미끼·유물·의뢰 보상 없음, 한 모드(수동 GOOD 또는 방치)로만 낚는다.
import { SPOTS } from '../../src/game/content/spots';
import type { SpotId } from '../../src/game/content/spots';
import { BOATS } from '../../src/game/content/boats';
import { FISH } from '../../src/game/content/fish';
import { powerOfLevel } from '../../src/game/rules/stats';
import { upgradeCost } from '../../src/game/rules/balance';
import { mutationWeightsOf, variantShare } from '../../src/game/rules/logic';
import { rates } from './model';
import type { Axis } from './model';

export interface Arrival { spot: SpotId; hours: number; waitGold: number; waitFame: number; waitBoth: number }
export interface Snapshot { minutes: number; spot: SpotId; boat: number; level: number; gold: number; fame: number; dex: number }
export interface Journey { arrivals: Arrival[]; snapshots: Snapshot[]; lastBoatHours: number | null }

const STEP_SEC = 60;
const LIMIT_HOURS = 2000;

/** 해역 열림 조건 — 배 단계와 낚싯대 파워 */
const opens = (spot: (typeof SPOTS)[number], boat: number, level: number) =>
  boat >= spot.boatTier && powerOfLevel(level) >= (spot.powerReq ?? 0);

export function simulateJourney(axis: Axis, snapshotMinutes: readonly number[] = [30, 60]): Journey {
  let gold = 0, fame = 0, level = 1, boat = 0, sec = 0;
  let lastBoatHours: number | null = null;
  let idx = 0;
  const arrivals: Arrival[] = [{ spot: SPOTS[0].id, hours: 0, waitGold: 0, waitFame: 0, waitBoth: 0 }];
  const snapshots: Snapshot[] = [];
  const pending = [...snapshotMinutes].sort((a, b) => a - b);
  const missNormal = new Map(FISH.map(f => [f.id, 1]));
  let waitGold = 0, waitFame = 0, waitBoth = 0;
  const cache = new Map<string, ReturnType<typeof rates>>();
  const rateOf = (spot: SpotId, lv: number) => {
    const key = `${spot}:${lv}`;
    if (!cache.has(key)) cache.set(key, rates(spot, lv, axis));
    return cache.get(key)!;
  };

  while (idx < SPOTS.length - 1 && sec < LIMIT_HOURS * 3600) {
    const here = SPOTS[idx];
    const r = rateOf(here.id, level);
    gold += r.goldPerHour * STEP_SEC / 3600;
    fame += r.famePerHour * STEP_SEC / 3600;
    const catches = r.catchesPerHour * STEP_SEC / 3600;
    for (const row of r.rows) {
      const p = row.prob * (1 - variantShare(mutationWeightsOf({ artifacts: [] }, here.id)));
      missNormal.set(row.fish.id, missNormal.get(row.fish.id)! * (1 - p) ** catches);
    }
    sec += STEP_SEC;

    // 다음 해역에 필요한 것을 산다 — 배(명성 하한 포함)와 파워 강화
    const next = SPOTS[idx + 1];
    let bought = true;
    while (bought) {
      bought = false;
      const needBoat = next.boatTier > boat ? BOATS.find(b => b.tier === boat + 1) : undefined;
      if (needBoat && gold >= needBoat.price && fame >= needBoat.fameReq) {
        gold -= needBoat.price; boat = needBoat.tier; bought = true; lastBoatHours = sec / 3600;
      }
      if (powerOfLevel(level) < (next.powerReq ?? 0) && gold >= upgradeCost(level)) {
        gold -= upgradeCost(level); level += 1; bought = true;
      }
    }
    if (opens(next, boat, level)) {
      idx += 1;
      arrivals.push({ spot: next.id, hours: sec / 3600, waitGold, waitFame, waitBoth });
      waitGold = waitFame = waitBoth = 0;
    } else {
      // 이번 걸음에 무엇이 모자랐나 — 남은 골드 필요량과 명성 필요량
      const boatLeft = boat < next.boatTier ? BOATS.find(b => b.tier === boat + 1) : undefined;
      let goldNeed = boatLeft?.price ?? 0;
      for (let lv = level; powerOfLevel(lv) < (next.powerReq ?? 0); lv++) goldNeed += upgradeCost(lv);
      const goldShort = gold < goldNeed;
      const fameShort = !!boatLeft && fame < boatLeft.fameReq;
      if (goldShort && fameShort) waitBoth += STEP_SEC; else if (fameShort) waitFame += STEP_SEC; else waitGold += STEP_SEC;
    }
    while (pending.length > 0 && sec >= pending[0] * 60) {
      snapshots.push({
        minutes: pending.shift()!, spot: SPOTS[idx].id, boat, level, gold, fame,
        dex: [...missNormal.values()].reduce((s, m) => s + (1 - m), 0),
      });
    }
  }
  return { arrivals, snapshots, lastBoatHours };
}
