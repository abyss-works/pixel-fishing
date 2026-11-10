// 표본 추출 — 해석적 기댓값 경로가 쓰는 확률(`mixedRows`)과 주기(`cycleOf`)를 그대로 받아 캐치를 하나씩 뽑는다.
// 가정: 확률과 가격은 기댓값 경로와 같다(pity, 미끼, 유물은 기댓값 경로에 없으므로 넣지 않는다). 획득 연출은 등급과 관계없이 같은 길이다.
import type { Fish } from '../../../src/game/content/fish';
import { RARITY } from '../../../src/game/content/rarity';
import { VARIANT_PRICE_MULT } from '../../../src/game/rules/balance';
import { variantShare } from '../../../src/game/rules/logic';
import { cycleSecAt } from '../model';
import type { Rates } from '../model';

export interface Catch { fish: Fish; gold: number; fame: number }

export interface Sampler {
  rng: () => number;
  /** 다음 캐치까지 걸리는 시간(초) */
  cycleSec(r: Rates): number;
  /** 풀에서 한 마리를 뽑고 돌연변이 여부를 정해 판매가와 명성을 낸다 */
  catchOf(r: Rates): Catch;
  /** 이미 정해진 어종의 판매가와 명성(첫 경험 보장 등) — 돌연변이 여부만 정한다 */
  valueOf(fish: Fish): Catch;
  /** sec초 동안 낚은 수입. 끝나지 않은 캐치는 다음 구간으로 이어진다 */
  accrue(r: Rates, sec: number): { gold: number; fame: number; catches: number };
}

export function createSampler(rng: () => number): Sampler {
  const share = variantShare();
  const cumulative = new WeakMap<Rates, number[]>();
  let next: number | null = null;

  const valueOf = (fish: Fish): Catch => ({
    fish, gold: fish.price * (rng() < share ? VARIANT_PRICE_MULT : 1), fame: RARITY[fish.rarity].fame,
  });
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
    accrue(r, sec) {
      let left = sec, gold = 0, fame = 0, catches = 0;
      if (next === null) next = cycleSec(r);
      while (next <= left) {
        left -= next;
        const c = catchOf(r);
        gold += c.gold; fame += c.fame; catches += 1;
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
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Dist { n: number; missing: number; mean: number; p10: number; p50: number; p90: number }

/** 값의 분포 요약. missing은 시간 안에 끝나지 못해 값이 없는 횟수다. 값이 없으면 null */
export function summarize(values: readonly number[], missing = 0): Dist | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length, missing, mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    p10: percentile(sorted, 0.1), p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9),
  };
}
