// LocalGameGateway 테스트용 시간 고정값. 운영 HTTP 요청은 이 저장소를 읽지 않는다.
const KEY = 'pf-time-override';
let override: string | null = null;
try {
  override = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
} catch { /* SSR/비보안 환경에서는 null 유지 */ }

const listeners = new Set<() => void>();

function persist(value: string | null) {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch { /* 저장 실패는 로컬 시간 재정의를 비활성화하지 않는다 */ }
}

export function setTimeOverride(value: string | null): void {
  if (override === value) return;
  override = value;
  persist(value);
  for (const listener of listeners) listener();
}

export function getTimeOverride(): string | null {
  return override;
}

export function subscribeTimeOverride(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function resetTimeOverride(): void {
  if (override === null) return;
  override = null;
  persist(null);
  for (const listener of listeners) listener();
}
