// 표본 추출 — 해석적 기댓값 경로가 쓰는 확률(`mixedRows`)과 주기(`cycleOf`)를 그대로 받아 캐치를 하나씩 뽑는다.
// 가정: 확률과 가격은 기댓값 경로와 같다(pity, 미끼, 유물은 기댓값 경로에 없으므로 넣지 않는다). 획득 연출은 등급과 관계없이 같은 길이다.
import type { Fish } from '../../../src/game/content/fish';
import { RARITY } from '../../../src/game/content/rarity';
import { VARIANT_PRICE_MULT } from '../../../src/game/rules/balance';
import { variantShare } from '../../../src/game/rules/logic';
import { cycleSecAt } from '../model';
import type { Rates } from '../model';

export interface Catch { fish: Fish; gold: number; fame: number; /** 돌연변이 폼인가 */ variant: boolean }

export interface Sampler {
  rng: () => number;
  /** 다음 캐치까지 걸리는 시간(초) */
  cycleSec(r: Rates): number;
  /** 풀에서 한 마리를 뽑고 돌연변이 여부를 정해 판매가와 명성을 낸다 */
  catchOf(r: Rates): Catch;
  /** 이미 정해진 어종의 판매가와 명성(첫 경험 보장 등) — 돌연변이 여부만 정한다 */
  valueOf(fish: Fish): Catch;
  /** sec초 동안 낚은 수입. 끝나지 않은 캐치는 다음 구간으로 이어진다. onCatch를 주면 낚은 캐치마다 부른다 */
  accrue(r: Rates, sec: number, onCatch?: (c: Catch) => void): { gold: number; fame: number; catches: number };
}

export function createSampler(rng: () => number): Sampler {
  const share = variantShare();
  const cumulative = new WeakMap<Rates, number[]>();
  let next: number | null = null;

  const valueOf = (fish: Fish): Catch => {
    const variant = rng() < share;
    return { fish, gold: fish.price * (variant ? VARIANT_PRICE_MULT : 1), fame: RARITY[fish.rarity].fame, variant };
  };
  const cycleSec = (r: Rates): number => cycleSecAt(r.cycle, rng());
  const catchOf = (r: Rates): Catch => {
    let cum = cumulative.get(r);
    if (!cum) {
      let acc = 0;
      cum = r.rows.map(row => (acc += row.prob));
      cumulative.set(r, cum);
    }
    const x = rng() * cum[cum.length - 1];
    let i = 0;
    while (i < cum.length - 1 && x >= cum[i]) i++;
    return valueOf(r.rows[i].fish);
  };
  return {
    rng, cycleSec, catchOf, valueOf,
    accrue(r, sec, onCatch) {
      let left = sec, gold = 0, fame = 0, catches = 0;
      if (next === null) next = cycleSec(r);
      while (next <= left) {
        left -= next;
        const c = catchOf(r);
        gold += c.gold; fame += c.fame; catches += 1;
        onCatch?.(c);
        next = cycleSec(r);
      }
      next -= left;
      return { gold, fame, catches };
    },
  };
}

/** 정렬된 값의 백분위(0에서 1) — 이웃 값 사이를 선형 보간한다 */
export function percentile(sorted: readonly number[], p: number): number {
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  // 끝나지 않은 값(무한대)이 보간 구간에 걸리면 그 백분위도 끝나지 않은 것이다
  if (sorted[hi] === Number.POSITIVE_INFINITY) return pos === lo ? sorted[lo] : Number.POSITIVE_INFINITY;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** n은 끝낸 시도 수, missing은 시간 안에 끝나지 못한 시도 수다. 끝내지 못한 시도가 있으면 mean은 null이고,
 *  백분위는 못 끝낸 시도를 가장 느린 쪽에 넣어 계산하므로 무한대(끝나지 않음)일 수 있다 */
export interface Dist { n: number; missing: number; mean: number | null; p10: number; p50: number; p90: number }

/** 값의 분포 요약. 끝낸 값이 하나도 없으면 null */
export function summarize(values: readonly number[], missing = 0): Dist | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const all = [...sorted, ...Array<number>(missing).fill(Number.POSITIVE_INFINITY)];
  return {
    n: sorted.length, missing, mean: missing > 0 ? null : sorted.reduce((s, v) => s + v, 0) / sorted.length,
    p10: percentile(all, 0.1), p50: percentile(all, 0.5), p90: percentile(all, 0.9),
  };
}
