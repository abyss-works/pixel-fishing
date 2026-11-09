// 지연 표본의 백분위 계산과 보관. 표본이 많아져도 메모리가 늘지 않게 상한을 두고 무작위로 대체한다.

export interface Summary { count: number; p50: number | null; p95: number | null; p99: number | null }

/** 가장 가까운 순위 방식의 백분위. 표본이 없으면 null이다 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? null;
}

export function summarize(values: readonly number[]): Summary {
  return { count: values.length, p50: percentile(values, 50), p95: percentile(values, 95), p99: percentile(values, 99) };
}

/** 상한 개수까지만 보관하는 표본 모음(저수지 표집). total은 상한과 무관한 전체 개수다 */
export class SampleSet {
  total = 0;
  private readonly kept: number[] = [];

  private readonly cap: number;
  private readonly rng: () => number;

  constructor(cap: number = 100_000, rng: () => number = Math.random) {
    this.cap = cap;
    this.rng = rng;
  }

  add(value: number): void {
    this.total++;
    if (this.kept.length < this.cap) { this.kept.push(value); return; }
    const slot = Math.floor(this.rng() * this.total);
    if (slot < this.cap) this.kept[slot] = value;
  }

  values(): readonly number[] { return this.kept; }

  summary(): Summary { return { ...summarize(this.kept), count: this.total }; }
}
