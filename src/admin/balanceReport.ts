// 밸런스 리포트 순수 계산 — 관리자 대시보드의 단일 데이터 출처.
// DOM 의존 0이라 테스트가 닫힌형 기대값과 직접 대조한다(EV 산식은 goldEV와 동치).
//
// **보상 통계 축 5종** — 판정 다이얼은 전부 common 축(rareMult=일반 예산 ÷ / commonMult=일반 예산 ×):
//   노 어드밴티지(스페이스 1회, 존 밖) · GOOD(÷1.6) · PERFECT(÷2) — 수동 3축
//   방치·최소 페널티(파워 여유 충분, commonMult ×4) · 방치·최대 페널티(진입 직후, ×10) — 자동 2축
// 축이 아니라 **조건 계층**인 것(여기에 나오지 않는다): 수동 파워 초과 보정(최대 ×2 실현치),
// 미달 수역 페널티(×16 캡+입질 가산), 미끼(특정 등급 예산 ×2), 밤/아티팩트(미구현).
// 이들은 파워 레벨·보유 아이템에 따라 달라져서 축으로 두면 표가 상태 의존이 된다.
import { RARITY, SPOTS, drawRows } from '../game/logic';
import type { DrawOptions, RarityId } from '../game/logic';
import type { SpotId } from '../data/spots';

export type EvAxisKey = 'normal' | 'good' | 'perfect' | 'idleBest' | 'idleWorst';

export interface EvAxisDef {
  key: EvAxisKey;
  label: string;
  short: string;
  hint: string;
  options: DrawOptions;
}

export const EV_AXES: readonly EvAxisDef[] = [
  { key: 'normal', label: '노 어드밴티지', short: '무판정', hint: '수동 낚시 — 타이밍 바를 존 밖에서 끊는다(스페이스꾹). 다이얼 없음.',
    options: {} },
  { key: 'good', label: 'GOOD', short: 'GOOD', hint: '노란 존 — 일반 예산 ÷1.6.',
    options: { rareMult: 1.6 } },
  { key: 'perfect', label: 'PERFECT', short: 'PERFECT', hint: '빨간 존 — 일반 예산 ÷2.0.',
    options: { rareMult: 2.0 } },
  { key: 'idleBest', label: '방치·최소 페널티', short: '방치↓', hint: '방치 판정, 파워 여유 충분(요구+30 이상) — 일반 예산 ×4.',
    options: { commonMult: 4 } },
  { key: 'idleWorst', label: '방치·최대 페널티', short: '방치↑', hint: '방치 판정, 요구 파워 경계 — 일반 예산 ×10.',
    options: { commonMult: 10 } },
];

/** 단일 수역×단일 축의 골드 EV — drawRows 행열의 확률 가중합(goldEV와 동치, 다이얼 반영 버전) */
export function goldEv(spotId: SpotId, o: DrawOptions): number {
  const rows = drawRows(spotId, o);
  let num = 0, den = 0;
  for (const r of rows) { num += r.fishPct * r.fish.price; den += r.fishPct; }
  return den > 0 ? num / den : 0;
}

/** 단일 수역×단일 축의 명성 EV — 등급 고정 명성(RARITY.fame)의 확률 가중합 */
export function fameEv(spotId: SpotId, o: DrawOptions): number {
  const rows = drawRows(spotId, o);
  let num = 0, den = 0;
  for (const r of rows) {
    num += r.fishPct * RARITY[r.fish.rarity].fame;
    den += r.fishPct;
  }
  return den > 0 ? num / den : 0;
}

/** 이 수역의 실효 등급 예산 — 오버라이드 있으면 그 값, 없으면 글로벌 표(drawRows의 정본 사용).
 *  부재 등급은 행 자체가 없어 누락된다(재균등은 확률에 흡수됨). */
export function effectiveBudgets(spotId: SpotId): Partial<Record<RarityId, number>> {
  const out: Partial<Record<RarityId, number>> = {};
  for (const r of drawRows(spotId)) {
    if (!(r.fish.rarity in out)) out[r.fish.rarity] = r.rarityWeight;
  }
  return out;
}

export interface SpotBalance {
  id: SpotId;
  name: string;
  powerReq: number;
  boatTier: number;
  /** 수역 등급 예산 오버라이드(spots.rarityWeight) — null이면 글로벌 표 */
  override: Partial<Record<RarityId, number>> | null;
  /** 실효 예산(오버라이드 반영, 부재 등급은 키 없음) */
  budgets: Partial<Record<RarityId, number>>;
  /** [축] → EV */
  gold: Record<EvAxisKey, number>;
  fame: Record<EvAxisKey, number>;
  /** Δ 이전 해역 대비(중립 축, 절대값) — 첫 행은 null */
  deltaGold: number | null;
  deltaFame: number | null;
}

/** 변화량 축 — 대시보드 열 구성의 정본. 각 항목은 차분 계산과 라벨·힌트를 담는다.
 *  ① 일반 수동 대비 판정 보너스(GOOD/PERFECT) ② 완전 방치 최소↔최대 간격(파워 여유 소득 편차)
 *  ③ 전 지역 방치 평균 대비 증가량 — 마지막 축은 전체 평균이 필요해 buildBalanceReport가 주입한다. */
export interface DeltaAxisDef {
  key: string;
  label: string;
  hint: string;
  /** 이 해역의 값과 기준을 받아 차분. null = 해당 없음('—') */
  compute: (cur: SpotBalance, base: SpotBalance | null) => number | null;
}

const idleAvgOf = (r: SpotBalance): number =>
  (r.gold.idleBest + r.gold.idleWorst) / 2;

export const DELTA_AXES: readonly DeltaAxisDef[] = [
  { key: 'goodBonus', label: 'GOOD+', hint: '노 어드밴티지 → GOOD로 올렸을 때 증가분.',
    compute: (c) => c.gold.good - c.gold.normal },
  { key: 'perfectBonus', label: 'PERFECT+', hint: '노 어드밴티지 → PERFECT 증가분.',
    compute: (c) => c.gold.perfect - c.gold.normal },
  { key: 'idleGap', label: '방치 간격', hint: '완전 방치 최소(×4)와 최대(×10) 페널티의 차 — 파워 여유에 따른 방치 소득 폭.',
    compute: (c) => c.gold.idleBest - c.gold.idleWorst },
  // compute는 buildBalanceReport가 전체 평균을 계산해 주입한다
] as DeltaAxisDef[];

/** SPOTS 등록 순서(진행 사다리 순서)로 전 수역 리포트 조립 */
export function buildBalanceReport(): SpotBalance[] {
  const out: SpotBalance[] = [];
  for (const spot of SPOTS) {
    const id = spot.id;
    const gold = Object.fromEntries(
      EV_AXES.map(a => [a.key, goldEv(id, a.options)])) as Record<EvAxisKey, number>;
    const fame = Object.fromEntries(
      EV_AXES.map(a => [a.key, fameEv(id, a.options)])) as Record<EvAxisKey, number>;
    const prev = out[out.length - 1];
    out.push({
      id, name: spot.name, powerReq: spot.powerReq ?? 0, boatTier: spot.boatTier,
      override: spot.rarityWeight ?? null,
      budgets: effectiveBudgets(id),
      gold, fame,
      deltaGold: prev ? gold.normal - prev.gold.normal : null,
      deltaFame: prev ? fame.normal - prev.fame.normal : null,
    });
  }
  // "전 지역 동일 지표 대비" 축 — 전체 방치 평균을 계산해 마지막 Δ 정의를 주입한다
  const allIdleAvg = out.length > 0
    ? out.reduce((s, r) => s + idleAvgOf(r), 0) / out.length : 0;
  const axes = DELTA_AXES as DeltaAxisDef[];
  if (axes[axes.length - 1]?.key !== 'idleAvgDelta') {
    axes.push({
      key: 'idleAvgDelta', label: '방치평균 vs 전지역', hint:
        '이 해역의 방치 평균((최소+최대)/2) − 전 수역 평균. 사다리에서 앞서나 있는 정도.',
      compute: (c) => idleAvgOf(c) - allIdleAvg,
    });
  }
  return out;
}
