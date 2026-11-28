// 타이밍 바 판정과 빨간 존 위치의 순수 규칙.

export type TimingJudgment = 'perfect' | 'good' | 'normal';
export type CatchJudgment = TimingJudgment | 'auto';
export type ClaimConsistency = 'ok' | 'mismatch' | 'missing-pos';

/** 문자열 시드를 [0, 1) 구간의 결정적 값으로 매핑한다. */
export function hashToUnit(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // 최종 혼합 — 비슷한 입력(연속 버전)도 출력이 고르게 흩어지게 한다
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

/** 캐스트 시드에서 빨간 존 중심을 유도한다. 노란 존과 빨간 존 폭은 바 길이 대비 비율(0~1)이다. */
export function redZoneCenter(seed: string, yellow: number, red: number): number {
  const amplitude = Math.max(0, Math.min(0.3 * yellow, (yellow - red) / 2));
  return 0.5 + (hashToUnit(seed) * 2 - 1) * amplitude;
}

/** 챔질 판정: 커서 위치(0~1)가 중앙 노란 존 안이면 GOOD, 그 안의 빨간 존이면 PERFECT. */
export function judgeTiming(pos: number, yellow: number, red = 0, redCenter = 0.5): TimingJudgment {
  const epsilon = 1e-12;
  if (red > 0 && Math.abs(pos - redCenter) <= red / 2 + epsilon) return 'perfect';
  return Math.abs(pos - 0.5) <= yellow / 2 + epsilon ? 'good' : 'normal';
}

/** 챔질 경과(ms)를 바 비율 위치로 환산한다. 유효한 값이 없으면 null. */
export function timingPos(biteElapsed: number | undefined, sweep: number): number | null {
  if (biteElapsed === undefined) return null;
  if (!Number.isFinite(biteElapsed) || biteElapsed < 0 || !Number.isFinite(sweep) || sweep <= 0) return null;
  return biteElapsed / 1000 / sweep;
}

/** 클라이언트 주장 판정과 커서·존 위치의 일관성을 검증한다 (내부 감사 분류 전용). */
export function verifyClaimedJudgment(
  claimed: CatchJudgment,
  pos: number | null,
  redPos: number | null,
  yellowWidth: number,
  redWidth: number,
): ClaimConsistency {
  if (claimed === 'auto' || claimed === 'normal') return 'ok';
  if (pos === null) return 'missing-pos';
  const epsilon = 1e-6;
  if (claimed === 'perfect') {
    return redPos !== null && redWidth > 0 && Math.abs(pos - redPos) <= redWidth / 2 + epsilon ? 'ok' : 'mismatch';
  }
  return yellowWidth > 0 && Math.abs(pos - 0.5) <= yellowWidth / 2 + epsilon ? 'ok' : 'mismatch';
}
