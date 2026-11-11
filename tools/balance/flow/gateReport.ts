// 게이트 보고 — 이동 직후 수입, PERFECT 이상치, 배 명성 대기 ÷ 골드 대기, 최초 10분 도달, 전환 시간의 목표 판정(범위와 순서)을 모아 낸다.
// 판정과 알려진 예외 목록은 게이트 모듈이 갖고, 여기서는 지표 모듈의 값을 판정에 넣어 표 행으로 만든다.
// 전환 시간은 새 계정이 직전 해역에서 방치로 낚는 경우로 잰다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { topZoneOfSpot } from '../../../src/game/content/zones';
import { SPEC_MARGIN, entryLevel, perfectOverIdle } from '../model';
import {
  REGION_ENTRY_TARGET, TIME_GATE_FROM_SPOT, gateRows, judgeFameRatio, judgeOpening, judgePerfect, judgeTimeOrder, judgeTimeRange,
} from '../gates';
import type { GateRow, GateVerdict } from '../gates';
import { simulateOpening } from './opening';
import type { Judgment } from './opening';
import type { RatePlan } from './progress';
import { transitionReport } from './transitions';

export interface PerfectRow { spot: SpotId; margin: number; level: number; ratio: number; verdict: GateVerdict }

export interface FameRow {
  from: SpotId; to: SpotId;
  /** 골드가 막은 시간과 배 명성이 막은 시간(시간). 최대 일수 안에 닿지 못한 전환은 null이고 위반이다 */
  goldWait: number | null; fameWait: number | null;
  /** 명성 대기 ÷ 골드 대기. 골드 대기가 0이면 null */
  ratio: number | null;
  verdict: GateVerdict;
}

export interface OpeningGateRow {
  judgment: Judgment;
  /** 후보 중 가장 느린 첫 경험 보장 번호와 그때의 도착 시간(초), 캐치 수. 닿지 못했으면 null */
  legendAt: number;
  seconds: number | null; catches: number | null;
  verdict: GateVerdict;
}

/** observe는 리프까지의 전환(시간만 관측), entry는 지역 진입 전환, inner는 같은 지역 안의 전환 */
export type TimeKind = 'observe' | 'entry' | 'inner';

export interface TimeRow {
  from: SpotId; to: SpotId;
  kind: TimeKind;
  /** 전환 시간(실질 낚시 시간)과 8시간 환산 일수. 최대 일수 안에 닿지 못한 전환은 null이다 */
  hours: number | null; days: number | null;
  /** 목표 범위(시간)와 범위 판정. 지역 진입 전환에만 있다 */
  range: readonly [number, number] | null;
  rangeVerdict: GateVerdict | null;
  /** 직전 전환의 시간과 순서 판정. 판정 구간의 첫 전환에는 없다 */
  prevHours: number | null;
  orderVerdict: GateVerdict | null;
  /** 이 전환의 요구 파워 간격과, 같은 지역 안의 전환이면 그 지역 진입 전환의 요구 파워 간격 */
  powerGap: number;
  entryPowerGap: number | null;
  /** 효과 계획을 줬을 때 효과 없는 같은 조건의 전환 시간. 닿지 못했으면 null */
  baseHours?: number | null;
}

export interface GatesReport {
  move: GateRow[];
  perfect: PerfectRow[];
  fame: FameRow[];
  opening: OpeningGateRow[];
  time: TimeRow[];
  /** 효과 계획을 줬을 때 효과 없는 이동 직후 수입 */
  moveBase?: GateRow[];
}

export interface GatesOptions {
  maxDays: number;
  /** 최초 10분 게이트가 보는 전설 보장 번호 후보. 후보 중 가장 느린 값으로 판정한다 */
  legendAts: number[];
  /** 일반 의뢰와 네임드 토벌을 매일 수행하는가(전환 시간에만 영향). 기본은 수행하지 않는다 */
  bounty?: boolean;
  /** 주면 이동 직후 수입과 전환 시간을 이 계획으로 재고(관측용) 효과 없는 값을 함께 담는다. PERFECT 이상치와 최초 10분은 효과와 관계없어 내지 않는다 */
  plan?: RatePlan;
}

const powerReq = (id: SpotId) => SPOTS.find(s => s.id === id)!.powerReq ?? 0;

function perfectRows(): PerfectRow[] {
  return SPOTS.flatMap(s => [0, SPEC_MARGIN].map(margin => {
    const level = entryLevel(s.id) + margin;
    const ratio = perfectOverIdle(s.id, level);
    return { spot: s.id, margin, level, ratio, verdict: judgePerfect(ratio) };
  }));
}

function openingRows(legendAts: number[]): OpeningGateRow[] {
  return (['normal', 'good'] as const).map(judgment => {
    const runs = legendAts.map(legendAt => ({ legendAt, a: simulateOpening({ judgment, legendAt }).arrival }));
    const worst = runs.find(r => r.a === null) ?? runs.reduce((w, r) => (r.a!.seconds > w.a!.seconds ? r : w));
    const seconds = worst.a?.seconds ?? null;
    return { judgment, legendAt: worst.legendAt, seconds, catches: worst.a?.catches ?? null, verdict: judgeOpening(seconds) };
  });
}

function timeAndFame(maxDays: number, bounty: boolean, plan?: RatePlan): { time: TimeRow[]; fame: FameRow[] } {
  const { rows, timings, base } = transitionReport({ axis: 'idle', maxDays, bounty, plan });
  const start = SPOTS.findIndex(s => s.id === TIME_GATE_FROM_SPOT);
  const gap = (from: SpotId, to: SpotId) => powerReq(to) - powerReq(from);
  const entryGapOf = (to: SpotId): number | null => {
    const zone = topZoneOfSpot(to);
    const i = SPOTS.findIndex(s => topZoneOfSpot(s.id) === zone);
    return i > 0 ? gap(SPOTS[i - 1].id, SPOTS[i].id) : null;
  };
  const time: TimeRow[] = [], fame: FameRow[] = [];
  rows.forEach(({ from, to, boats }, i) => {
    const t = timings[i] as (typeof timings)[number] | undefined;
    const judged = i >= start;
    const entry = topZoneOfSpot(from) !== topZoneOfSpot(to);
    const target = entry ? (REGION_ENTRY_TARGET as Record<string, readonly [number, number]>)[topZoneOfSpot(to) ?? ''] ?? null : null;
    const prev = judged && i > start ? timings[i - 1]?.hours ?? null : null;
    // 닿지 못한 전환은 판정에서 빼지 않고 위반으로 낸다
    const range = !judged || !target ? null : t ? judgeTimeRange(to, target, t.hours) : '위반';
    const order = !judged || i === start ? null : t && prev !== null ? judgeTimeOrder(to, t.hours, prev) : '위반';
    time.push({
      from, to, kind: !judged ? 'observe' : entry ? 'entry' : 'inner', hours: t?.hours ?? null, days: t?.days ?? null,
      range: judged ? target : null, rangeVerdict: range, prevHours: prev, orderVerdict: order,
      powerGap: gap(from, to), entryPowerGap: judged && !entry ? entryGapOf(to) : null,
      ...(base ? { baseHours: base[i]?.hours ?? null } : {}),
    });
    if (judged && boats.length > 0) {
      fame.push(t
        ? { from, to, goldWait: t.goldWait, fameWait: t.fameWait, ratio: t.fameOverGold, verdict: judgeFameRatio(to, t.fameOverGold, t.fameWait) }
        : { from, to, goldWait: null, fameWait: null, ratio: null, verdict: '위반' });
    }
  });
  return { time, fame };
}

export function gatesReport(o: GatesOptions): GatesReport {
  const { time, fame } = timeAndFame(o.maxDays, o.bounty ?? false, o.plan);
  if (o.plan) {
    const plan = o.plan;
    return { move: gateRows((spot, level, pool, boat) => plan.rateFor(spot, level, 'idle', boat, pool)), moveBase: gateRows(), perfect: [], fame, opening: [], time };
  }
  return { move: gateRows(), perfect: perfectRows(), fame, opening: openingRows(o.legendAts), time };
}

/** 모든 게이트 줄의 판정 */
export const verdictList = (r: GatesReport): GateVerdict[] => [
  ...r.move.map(x => x.verdict), ...r.perfect.map(x => x.verdict), ...r.fame.map(x => x.verdict), ...r.opening.map(x => x.verdict),
  ...r.time.flatMap(t => [t.rangeVerdict, t.orderVerdict]).filter((v): v is GateVerdict => v !== null),
];

export function verdictCounts(r: GatesReport): Record<GateVerdict, number> {
  const c: Record<GateVerdict, number> = { 통과: 0, 예외: 0, 개선: 0, 위반: 0 };
  for (const v of verdictList(r)) c[v]++;
  return c;
}
