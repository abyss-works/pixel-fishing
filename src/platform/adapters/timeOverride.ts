// 개발 도구 시간대·낮/밤 고정 저장소.
// 분 단위 시각(timeOverride)은 LocalGameGateway 전용이고,
// 낮/밤 강제 전환(phaseOverride)은 프리뷰·로컬 모두에서 캐치 요청(forcePhase)과 화면 연출을 동기화한다.
const KEY = 'pf-time-override';
const PHASE_KEY = 'pf-phase-override';

export type PhaseOverride = 'day' | 'night' | null;

let override: string | null = null;
let phaseOverride: PhaseOverride = null;
try {
  if (typeof localStorage !== 'undefined') {
    override = localStorage.getItem(KEY);
    const rawPhase = localStorage.getItem(PHASE_KEY);
    phaseOverride = rawPhase === 'day' || rawPhase === 'night' ? rawPhase : null;
  }
} catch { /* SSR/비보안 환경에서는 null 유지 */ }

const listeners = new Set<() => void>();
const phaseListeners = new Set<() => void>();

function persist(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* 저장 실패는 시간 재정의를 비활성화하지 않는다 */ }
}

export function setTimeOverride(value: string | null): void {
  if (override === value) return;
  override = value;
  persist(KEY, value);
  for (const listener of listeners) listener();
}

export function getTimeOverride(): string | null {
  return override;
}

export function subscribeTimeOverride(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setPhaseOverride(value: PhaseOverride): void {
  if (phaseOverride === value) return;
  phaseOverride = value;
  persist(PHASE_KEY, value);
  for (const listener of phaseListeners) listener();
}

export function getPhaseOverride(): PhaseOverride {
  return phaseOverride;
}

export function subscribePhaseOverride(listener: () => void): () => void {
  phaseListeners.add(listener);
  return () => { phaseListeners.delete(listener); };
}

export function resetPhaseOverride(): void {
  setPhaseOverride(null);
}

export function resetTimeOverride(): void {
  if (override !== null) {
    override = null;
    persist(KEY, null);
    for (const listener of listeners) listener();
  }
  resetPhaseOverride();
}
