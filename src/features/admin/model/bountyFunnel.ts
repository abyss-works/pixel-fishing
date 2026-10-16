import type { AdminBountyFunnelRow } from './types';
import { adminNumber } from './adminViews';

type Counts = Omit<AdminBountyFunnelRow, 'day'>;

export interface BountyFunnel {
  totals: Counts;
  /** 흔적 중 결투까지 간 비율 — 흔적이 없으면 null */
  duelRate: number | null;
  /** 결투 승률 — 결투가 없으면 null */
  winRate: number | null;
  /** 결투 없이 남았거나 만료된 흔적 수(기간 안 발급 − 결투) */
  unresolved: number;
}

const KEYS: (keyof Counts)[] = [
  'named_accepts', 'tickets', 'duels_won', 'duels_lost', 'named_rewards', 'general_accepts', 'general_rewards',
];

/** 바운티 퍼널 — 일계 행을 기간 합계로 묶고 단계 전환율을 낸다 */
export function selectBountyFunnel(rows: readonly AdminBountyFunnelRow[]): BountyFunnel {
  const totals = Object.fromEntries(KEYS.map(k => [k, 0])) as Counts;
  for (const r of rows) for (const k of KEYS) totals[k] += adminNumber(r[k] as number | string | null);
  const duels = totals.duels_won + totals.duels_lost;
  return {
    totals,
    duelRate: totals.tickets > 0 ? duels / totals.tickets : null,
    winRate: duels > 0 ? totals.duels_won / duels : null,
    unresolved: Math.max(0, totals.tickets - duels),
  };
}
