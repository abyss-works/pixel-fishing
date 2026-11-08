// 이동 직후 수입 게이트 — 새 해역 진입 레벨의 방치 수입이 같은 레벨로 낚을 수 있는 이전 해역 중 가장 좋은 값 이상이어야 한다.
// 판정과 알려진 역전 목록의 단일 원천이다. 게이트 테스트와 흐름 도구의 gates 명령이 함께 쓴다.
import { SPOTS } from '../../src/game/content/spots';
import type { SpotId } from '../../src/game/content/spots';
import { moveGap } from './model';
import type { Pool } from './model';

/** 게이트를 보기 시작하는 해역 — 이 해역으로 옮기는 전환부터 마지막 해역까지 센다 */
export const GATE_FROM_SPOT: SpotId = 'sea';

export const GATE_POOLS: readonly Pool[] = ['day', 'mixed'];

/** 확정 밸런스의 알려진 역전, 관측 이슈로 추적한다. 값은 해역별 이동 직후 수입 차이(새 해역 - 비교 해역)다 */
export const KNOWN_INVERSIONS: Partial<Record<SpotId, Record<Pool, number>>> = {
  barrierreef: { day: -604.36, mixed: -577.26 },
  southindian: { day: -3989.26, mixed: -6374.33 },
  comorodeep: { day: -42614.75, mixed: -60618.06 },
};

export type GateVerdict = '통과' | '위반' | '예외';

export interface GateRow {
  spot: SpotId;
  pool: Pool;
  /** 비교 해역(같은 레벨로 낚을 수 있는 이전 해역 중 가장 좋은 곳). 없으면 undefined */
  from: SpotId | undefined;
  /** 이동 전 수입(비교 해역의 방치 시간당 골드) */
  before: number;
  /** 이동 직후 수입(새 해역의 방치 시간당 골드) */
  after: number;
  diff: number;
  verdict: GateVerdict;
}

/** 시작 해역부터 마지막 해역까지 전환마다, 풀(낮, 낮밤 혼합)마다 한 줄 */
export function gateRows(): GateRow[] {
  const start = SPOTS.findIndex(s => s.id === GATE_FROM_SPOT);
  const rows: GateRow[] = [];
  for (let i = start; i < SPOTS.length; i++) {
    const spot = SPOTS[i].id;
    for (const pool of GATE_POOLS) {
      const g = moveGap(i, pool);
      const verdict: GateVerdict = g.diff >= 0 ? '통과' : KNOWN_INVERSIONS[spot] ? '예외' : '위반';
      rows.push({ spot, pool, from: g.from, before: g.fromGold, after: g.gold, diff: g.diff, verdict });
    }
  }
  return rows;
}
