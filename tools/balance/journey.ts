// 새 계정 진행 시뮬레이션 — 열린 해역 중 가장 뒤 해역에서 낚고, 다음 해역에 필요한 배·강화를 살 수 있으면 바로 산다.
// 누적 도달 시간, 첫 세션 도달점, 해역 전환마다 무엇(골드·명성)을 기다렸는지를 잰다.
// 가정: 판매는 즉시(이동·판매 왕복 없음), 쿠폰·미끼·유물·의뢰 보상 없음, 한 모드(수동 GOOD 또는 방치)로만 낚는다.
import { SPOTS } from '../../src/game/content/spots';
import type { SpotId } from '../../src/game/content/spots';
import { FISH } from '../../src/game/content/fish';
import { rates } from './model';
import type { Axis } from './model';
import { STEP_SEC, buyForSpot, missingForSpot, normalFormShare, opens } from './flow/progress';
import type { SpotProgress } from './flow/progress';

export interface Arrival { spot: SpotId; hours: number; waitGold: number; waitFame: number; waitBoth: number }
export interface Snapshot { minutes: number; spot: SpotId; boat: number; level: number; gold: number; fame: number; dex: number }
export interface Journey { arrivals: Arrival[]; snapshots: Snapshot[]; lastBoatHours: number | null }

const LIMIT_HOURS = 2000;

export function simulateJourney(axis: Axis, snapshotMinutes: readonly number[] = [30, 60]): Journey {
  const state: SpotProgress = { gold: 0, fame: 0, level: 1, boat: 0 };
  let sec = 0;
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
  const normalShare = new Map<SpotId, number>();

  while (idx < SPOTS.length - 1 && sec < LIMIT_HOURS * 3600) {
    const here = SPOTS[idx];
    const r = rateOf(here.id, state.level);
    state.gold += r.goldPerHour * STEP_SEC / 3600;
    state.fame += r.famePerHour * STEP_SEC / 3600;
    const catches = r.catchesPerHour * STEP_SEC / 3600;
    let share = normalShare.get(here.id);
    if (share === undefined) { share = normalFormShare(here.id); normalShare.set(here.id, share); }
    for (const row of r.rows) {
      const p = row.prob * share;
      missNormal.set(row.fish.id, missNormal.get(row.fish.id)! * (1 - p) ** catches);
    }
    sec += STEP_SEC;

    // 다음 해역에 필요한 것을 산다 — 배(명성 하한 포함)와 파워 강화
    const next = SPOTS[idx + 1];
    if (buyForSpot(next, state)) lastBoatHours = sec / 3600;
    if (opens(next, state.boat, state.level)) {
      idx += 1;
      arrivals.push({ spot: next.id, hours: sec / 3600, waitGold, waitFame, waitBoth });
      waitGold = waitFame = waitBoth = 0;
    } else {
      // 이번 걸음에 무엇이 모자랐나 — 남은 골드 필요량과 명성 필요량
      const wait = missingForSpot(next, state);
      if (wait === 'both') waitBoth += STEP_SEC; else if (wait === 'fame') waitFame += STEP_SEC; else waitGold += STEP_SEC;
    }
    while (pending.length > 0 && sec >= pending[0] * 60) {
      snapshots.push({
        minutes: pending.shift()!, spot: SPOTS[idx].id, boat: state.boat, level: state.level, gold: state.gold, fame: state.fame,
        dex: [...missNormal.values()].reduce((s, m) => s + (1 - m), 0),
      });
    }
  }
  return { arrivals, snapshots, lastBoatHours };
}
