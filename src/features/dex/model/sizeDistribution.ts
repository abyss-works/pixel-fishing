import { dexRecord, sizeParams, sizePercentile } from '../../../game/rules/logic';
import type { Fish, GameState } from '../../../game/rules/logic';

/** 그래프 범위 — 평균 ±3.5σ. 크기는 1cm 아래로 롤되지 않는다 */
const SPAN_SIGMA = 3.5;
const SAMPLES = 64;

export interface SizeDistribution {
  /** 곡선 점 — x는 크기(cm), y는 평균 높이를 1로 둔 상대 밀도 */
  points: { x: number; y: number }[];
  min: number;
  max: number;
  mean: number;
  /** 내 어종 최대 기록의 위치. t는 범위 안 0~1 위치(범위 밖은 끝에 붙인다). 기록이 없으면 null */
  me: { size: number; topPercent: number; t: number } | null;
}

/** 어종 크기 분포(고정 정규분포)와 그 위의 내 최대 기록 위치를 만든다. 내 기록은 폼과 무관한 어종 최댓값이다 */
export function selectSizeDistribution(game: GameState, fish: Fish): SizeDistribution {
  const { mean, std } = sizeParams(fish);
  const min = Math.max(1, mean - SPAN_SIGMA * std);
  const max = mean + SPAN_SIGMA * std;
  const points = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const x = min + (max - min) * (i / SAMPLES);
    const z = (x - mean) / std;
    return { x, y: Math.exp(-0.5 * z * z) };
  });
  const sizes = (['normal', 'variant'] as const)
    .map(form => dexRecord(game, fish.id, form)?.maxSize)
    .filter((v): v is number => typeof v === 'number');
  const best = sizes.length ? Math.max(...sizes) : null;
  const me = best === null ? null : {
    size: best,
    topPercent: sizePercentile(fish, best),
    t: Math.min(1, Math.max(0, (best - min) / (max - min))),
  };
  return { points, min, max, mean, me };
}
