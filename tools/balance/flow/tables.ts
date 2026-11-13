// 낚싯대 강화와 명성의 관측 표 — 레벨별 강화비·누적 비용·레벨당 EV 변화, 전환당 구매 횟수, 누적 명성 곡선과 전환별 증분 명성.
// 값은 제품 규칙(강화비, 해역 요구 파워, 배 데이터)과 측정 모델의 방치 수입에서만 계산한다. 시간은 방치 낚시 기준이다.
import { BOATS } from '../../../src/game/content/boats';
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { upgradeCost } from '../../../src/game/rules/balance';
import { entryLevel, rates } from '../model';
import { powerOfLevel } from '../rodRules';
import { transitionGold } from './transitions';

export interface LevelRow {
  level: number; power: number;
  /** 이 레벨에서 다음 레벨로 올리는 강화비 */
  cost: number;
  /** 레벨 1에서 이 레벨까지 올리는 데 든 강화비의 합 */
  cumulative: number;
  /** 이 레벨의 파워가 요구를 채운 가장 뒤 해역(배는 있다고 본다). 첫 해역 요구에도 못 미치면 첫 해역 */
  spot: SpotId;
  /** 그 해역의 방치 시간당 골드(낮밤 혼합) */
  ev: number;
  /** 같은 해역에서 이 강화로 EV가 변하는 비율(다음 레벨 EV ÷ 이 레벨 EV - 1) */
  evGain: number;
  /** 강화비 ÷ 이 레벨의 방치 EV(시간) */
  costHours: number;
}

/** 레벨 범위의 강화 표. from과 to를 포함한다 */
export function levelRows(from: number, to: number): LevelRow[] {
  if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error('레벨은 정수여야 합니다');
  if (from < 1) throw new Error('레벨은 1 이상이어야 합니다');
  if (to < from) throw new Error('레벨 범위의 끝이 시작보다 작습니다(범위 오류)');
  let cumulative = 0;
  for (let lv = 1; lv < from; lv++) cumulative += upgradeCost(lv);
  const rows: LevelRow[] = [];
  for (let level = from; level <= to; level++) {
    const power = powerOfLevel(level);
    const open = SPOTS.filter(s => (s.powerReq ?? 0) <= power);
    const spot = (open.at(-1) ?? SPOTS[0]).id;
    const ev = rates(spot, level, 'idle').goldPerHour;
    const cost = upgradeCost(level);
    rows.push({
      level, power, cost, cumulative, spot, ev,
      evGain: rates(spot, level + 1, 'idle').goldPerHour / ev - 1, costHours: cost / ev,
    });
    cumulative += cost;
  }
  return rows;
}

export interface PurchaseRow {
  from: SpotId; to: SpotId;
  /** 다음 해역 진입 레벨까지 사는 강화 횟수, 새로 사는 배 수, 합계, 첫 전환부터의 누적 합계 */
  upgrades: number; boats: number; total: number; cumulative: number;
}

/** 전환마다 사는 횟수 */
export function purchaseRows(): PurchaseRow[] {
  let cumulative = 0;
  return transitionGold().map(r => {
    const upgrades = r.toLevel - entryLevel(r.from);
    const total = upgrades + r.boats.length;
    cumulative += total;
    return { from: r.from, to: r.to, upgrades, boats: r.boats.length, total, cumulative };
  });
}

export interface FameRow {
  from: SpotId; to: SpotId;
  /** 도착한 해역을 여는 배의 명성 요구치(누적 요구치)와 출발 해역을 여는 배의 요구치, 그 차이(증분). 배가 없는 해역은 0이다 */
  cumulative: number; previous: number; increment: number;
  /** 출발 해역 딱렙 방치 시간당 명성과, 증분을 모으는 시간(시간) */
  famePerHour: number; hours: number;
  /** 전환 골드 ÷ 출발 해역 딱렙 방치 EV(시간), 명성 시간 ÷ 골드 시간. 골드 시간이 0이면 null */
  goldHours: number; fameOverGold: number | null;
}

const fameOfBoatTier = (tier: number): number => BOATS.find(b => b.tier === tier)?.fameReq ?? 0;

/** 해역을 여는 배의 명성 요구치. 배가 필요 없는 해역은 0 */
export const heldFame = (spot: SpotId): number => fameOfBoatTier(SPOTS.find(s => s.id === spot)!.boatTier);

/** 누적 명성 곡선 — 전환마다 요구치와 증분, 증분을 방치로 모으는 시간 */
export function fameRows(): FameRow[] {
  const gold = transitionGold();
  return SPOTS.slice(1).map((to, i) => {
    const from = SPOTS[i];
    const cumulative = fameOfBoatTier(to.boatTier), previous = fameOfBoatTier(from.boatTier);
    const increment = Math.max(0, cumulative - previous);
    const r = rates(from.id, entryLevel(from.id), 'idle');
    const hours = increment / r.famePerHour;
    const goldHours = gold[i].totalGold / r.goldPerHour;
    return {
      from: from.id, to: to.id, cumulative, previous, increment, famePerHour: r.famePerHour, hours,
      goldHours, fameOverGold: goldHours > 0 ? hours / goldHours : null,
    };
  });
}
