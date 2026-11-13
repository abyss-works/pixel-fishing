// 전환 역산 — 출발 해역과 목표 시간(골드 시간, 명성 시간)에서 전환 골드, 배 가격, 명성 요구치를 낸다.
//   전환 골드 = 골드 시간 x 출발 해역 딱렙 방치 EV(낮밤 혼합)
//   배 가격 = 전환 골드의 일정 비중(기본 0.15)을 보상 반올림(앞 두 자리 유효숫자의 둘째 자리를 0 또는 5)으로 맞춘 값
//   강화 골드 = 전환 골드 - 배 가격. 이 골드로 출발 해역 진입 레벨에서 몇 레벨을 올릴 수 있는지 아래와 위 두 후보로 낸다
//   명성 요구치 = 출발 해역을 여는 배의 요구치 + 출발 해역 딱렙 방치 시간당 명성 x 명성 시간
// 시간은 방치 낚시 기준의 실질 낚시 시간이다. 값은 계산만 하고 정하지 않는다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { upgradeCost } from '../../../src/game/rules/balance';
import { entryLevel, rates } from '../model';
import { powerOfLevel } from '../rodRules';
import { roundReward } from './ev';
import { fameRows, heldFame } from './tables';
import { transitionGold } from './transitions';

/** 배 가격 ÷ 전환 골드의 기본 비중 */
export const BOAT_SHARE = 0.15;

export interface SolveTarget { from: SpotId; goldHours: number; fameHours: number }

export interface LevelCandidate {
  /** 출발 해역 진입 레벨에서 올리는 레벨 수, 그때의 레벨과 파워, 그 강화비 합 */
  gap: number; level: number; power: number; cost: number;
}

export interface SolveRow extends SolveTarget {
  evFrom: number; famePerHour: number;
  totalGold: number;
  boatPrice: number; upgradeGold: number;
  /** below는 강화비 합이 강화 골드 이하인 가장 큰 간격, above는 그 다음 간격이다 */
  levels: { below: LevelCandidate; above: LevelCandidate };
  fameFrom: number; fameIncrement: number; fameReq: number; fameReqRounded: number;
  /** 명성 시간 ÷ 골드 시간 */
  fameOverGold: number;
}

export interface SolveOptions {
  /** 배 가격의 전환 골드 비중(0 이상 1 미만). 기본 BOAT_SHARE */
  boatShare?: number;
}

function levelCandidates(from: SpotId, upgradeGold: number): { below: LevelCandidate; above: LevelCandidate } {
  const e = entryLevel(from);
  const at = (gap: number, cost: number): LevelCandidate => ({ gap, level: e + gap, power: powerOfLevel(e + gap), cost });
  let cost = 0, gap = 0;
  for (;;) {
    const next = cost + upgradeCost(e + gap);
    if (next > upgradeGold) return { below: at(gap, cost), above: at(gap + 1, next) };
    cost = next; gap += 1;
  }
}

/** 목표마다 역산한다 */
export function solveTargets(targets: readonly SolveTarget[], o: SolveOptions = {}): SolveRow[] {
  const share = o.boatShare ?? BOAT_SHARE;
  if (!(share >= 0 && share < 1)) throw new Error(`배 비중은 0 이상 1 미만이어야 합니다: ${share}`);
  return targets.map(t => {
    if (!SPOTS.some(s => s.id === t.from)) throw new Error(`없는 해역입니다: ${t.from}`);
    if (!(t.goldHours > 0)) throw new Error('골드 시간은 0보다 커야 합니다');
    if (!(t.fameHours >= 0)) throw new Error('명성 시간은 0 이상이어야 합니다');
    const r = rates(t.from, entryLevel(t.from), 'idle');
    const totalGold = t.goldHours * r.goldPerHour;
    const boatPrice = roundReward(share * totalGold);
    const upgradeGold = Math.max(0, totalGold - boatPrice);
    const fameFrom = heldFame(t.from), fameIncrement = r.famePerHour * t.fameHours, fameReq = fameFrom + fameIncrement;
    return {
      ...t, evFrom: r.goldPerHour, famePerHour: r.famePerHour, totalGold, boatPrice, upgradeGold,
      levels: levelCandidates(t.from, upgradeGold),
      fameFrom, fameIncrement, fameReq, fameReqRounded: roundReward(fameReq), fameOverGold: t.fameHours / t.goldHours,
    };
  });
}

/** 인자 `해역=골드시간/명성시간`을 읽는다 */
export function parseTarget(raw: string): SolveTarget {
  const m = /^([^=]+)=([^/]+)\/(.+)$/.exec(raw);
  if (!m) throw new Error(`--target 형식은 해역=골드시간/명성시간입니다: ${raw}`);
  const goldHours = Number(m[2]), fameHours = Number(m[3]);
  if (!Number.isFinite(goldHours) || !Number.isFinite(fameHours)) throw new Error(`--target의 시간은 숫자여야 합니다: ${raw}`);
  return { from: m[1] as SpotId, goldHours, fameHours };
}

export interface CurrentRow {
  from: SpotId; to: SpotId;
  /** 현행 전환의 골드 시간과 명성 시간(같은 환산) */
  goldHours: number; fameHours: number;
  boatCount: number; boatTiers: number[];
  /** 전환 골드의 배 비중 규칙으로 계산한 배 가격과 실제로 사는 배 값의 합 */
  ruleBoatPrice: number; actualBoatPrice: number;
}

/** 현행 전환을 같은 환산으로 본 값. 역산 입력과 같은 시간을 넣으면 현행 값이 나온다는 기준이다 */
export function currentRows(): CurrentRow[] {
  const fame = fameRows();
  return transitionGold().map((g, i) => ({
    from: g.from, to: g.to, goldHours: fame[i].goldHours, fameHours: fame[i].hours,
    boatCount: g.boats.length, boatTiers: g.boats.map(b => b.tier),
    ruleBoatPrice: roundReward(BOAT_SHARE * g.totalGold), actualBoatPrice: g.boatGold,
  }));
}
