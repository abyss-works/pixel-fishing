// 방치 결과 보고 — 자리를 비운 사이의 행동 기록(catch·autoRelease)을 요약하고,
// 결과 카드를 띄울지와 "다음엔" 조언을 판정한다. 서버(요약)와 클라이언트(조건·조언)가 함께 쓴다.
import { RARITY, RARITY_ORDER } from '../content/rarity.js';
import type { RarityId } from '../content/rarity.js';
import { FISH } from '../content/fish.js';
import type { FormId } from '../content/fish.js';
import { BOATS } from '../content/boats.js';
import type { SpotId } from '../content/spots.js';
import { priceOf } from './logic.js';
import type { GameState } from './logic.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** 결과 카드를 띄우는 최소 부재 시간 */
const REPORT_MIN_MS = 10 * MINUTE;
/** 조회 기간 상한 — 행동 기록 보관 기간 */
const WINDOW_MAX_MS = 7 * 24 * HOUR;

/** 행동 기록 한 줄 — 서버가 events 행에서 옮겨 담는다 */
export interface AwayEvent { type: string; at: string; payload: unknown }

export interface AwayWindow { from: string; to: string; awayMs: number }

export interface AwaySummary extends AwayWindow {
  catches: number;
  /** 잡은 물고기의 판매가 합 */
  value: number;
  fame: number;
  perHour: { catches: number; value: number; fame: number };
  /** 등급 순서(일반 → 전설). share는 잡은 수에 대한 비율(0~1) */
  grades: { rarity: RarityId; count: number; share: number }[];
  variants: { count: number; share: number };
  /** 새로 도감에 오른 폼. maxSize는 그 폼의 기간 내 가장 큰 크기 */
  newFish: { fishId: string; form: FormId; rarity: RarityId; maxSize: number }[];
  /** 가방이 넘쳐 놓아준 수와 판매가 합(어종 정보가 없는 예전 기록은 가치 0) */
  released: { count: number; value: number };
  /** 떠난 뒤 가방이 찬 시점(첫 자동 방생)까지의 시간. 차지 않았으면 null */
  bagFullAfterMs: number | null;
  /** 가장 많이 잡은 수역 */
  spot: SpotId | null;
}

export type AwayTip =
  | { kind: 'sell'; fullAfterMs: number }
  | { kind: 'fame'; boat: number; left: number; etaMs: number | null };

/** 결과 카드를 띄울 만큼 오래 비웠는가 */
export function awayReportDue(awayMs: number): boolean {
  return awayMs >= REPORT_MIN_MS;
}

/** 지금에서 비운 시간만큼 거슬러 올라간 조회 기간. 상한을 넘으면 자르고, 0 이하·숫자가 아니면 null */
export function awayWindow(awayMs: number, nowISO: string): AwayWindow | null {
  if (!Number.isFinite(awayMs) || awayMs <= 0) return null;
  const ms = Math.min(Math.floor(awayMs), WINDOW_MAX_MS);
  return { from: new Date(Date.parse(nowISO) - ms).toISOString(), to: nowISO, awayMs: ms };
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const form = (v: unknown): FormId => (v === 'variant' ? 'variant' : 'normal');
const fishOf = (id: unknown) => FISH.find(f => f.id === id);

export function summarizeAway(events: readonly AwayEvent[], window: AwayWindow): AwaySummary {
  const counts = new Map<RarityId, number>();
  const spots = new Map<string, number>();
  const fresh = new Map<string, AwaySummary['newFish'][number]>();
  const biggest = new Map<string, number>();
  let catches = 0, value = 0, fame = 0, variants = 0;
  let released = 0, releasedValue = 0;
  let firstRelease: number | null = null;

  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (e.type === 'catch') {
      const fish = fishOf(p.fishId);
      if (!fish) continue;
      const f = form(p.form);
      catches++;
      value += priceOf(fish, f);
      fame += RARITY[fish.rarity].fame;
      if (f === 'variant') variants++;
      counts.set(fish.rarity, (counts.get(fish.rarity) ?? 0) + 1);
      const spot = str(p.spot);
      if (spot) spots.set(spot, (spots.get(spot) ?? 0) + 1);
      const key = `${fish.id}:${f}`;
      const size = typeof p.size === 'number' ? p.size : 0;
      biggest.set(key, Math.max(biggest.get(key) ?? 0, size));
      if (p.isNew === true && !fresh.has(key)) fresh.set(key, { fishId: fish.id, form: f, rarity: fish.rarity, maxSize: 0 });
    } else if (e.type === 'autoRelease') {
      const t = Date.parse(e.at);
      if (firstRelease === null || t < firstRelease) firstRelease = t;
      released += Array.isArray(p.uids) ? p.uids.length : 0;
      for (const r of Array.isArray(p.fish) ? p.fish as Record<string, unknown>[] : []) {
        const fish = fishOf(r?.fishId);
        if (fish) releasedValue += priceOf(fish, form(r.form));
      }
    }
  }

  const share = (n: number) => (catches > 0 ? n / catches : 0);
  const hours = window.awayMs / HOUR;
  const rate = (n: number) => n / hours;
  let spot: SpotId | null = null;
  for (const [id, n] of spots) if (spot === null || n > spots.get(spot)!) spot = id as SpotId;

  return {
    ...window,
    catches, value, fame,
    perHour: { catches: rate(catches), value: rate(value), fame: rate(fame) },
    grades: RARITY_ORDER.map(rarity => ({ rarity, count: counts.get(rarity) ?? 0, share: share(counts.get(rarity) ?? 0) })),
    variants: { count: variants, share: share(variants) },
    newFish: [...fresh].map(([key, n]) => ({ ...n, maxSize: biggest.get(key) ?? 0 })),
    released: { count: released, value: releasedValue },
    bagFullAfterMs: firstRelease === null ? null : Math.max(0, firstRelease - Date.parse(window.from)),
    spot,
  };
}

/** "다음엔" 조언 — 가방이 찼으면 판매 권유, 다음 배의 명성 조건이 남았으면 남은 양과 지금 속도의 예상 시간.
 *  해당하지 않는 조언은 뺀다 */
export function awayTips(summary: AwaySummary, state: Pick<GameState, 'fame' | 'boat'>): AwayTip[] {
  const tips: AwayTip[] = [];
  if (summary.bagFullAfterMs !== null) tips.push({ kind: 'sell', fullAfterMs: summary.bagFullAfterMs });
  // BOATS는 tier 1부터 차례로 놓여 지금 배(tier = state.boat)의 다음 배가 BOATS[state.boat]다
  const next = BOATS[state.boat];
  const left = next ? next.fameReq - state.fame : 0;
  if (next && left > 0) {
    tips.push({ kind: 'fame', boat: next.tier, left,
      etaMs: summary.fame > 0 ? Math.round(left * summary.awayMs / summary.fame) : null });
  }
  return tips;
}
