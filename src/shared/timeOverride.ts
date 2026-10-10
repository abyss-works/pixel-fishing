import { useSyncExternalStore } from 'react';

// 로컬 시간대 고정 — 관리자 콘솔에서 밤/낮을 강제해 밤 어종을 테스트하는 도구.
// 캔버스 덮개(canvasCover)와 같은 성격: 브라우저(로컬 dev) 사정이지 세이브/서버 상태가 아니다.
// LocalBackend가 이 값을 읽어 catch의 now로 쓴다(운영 http는 이 모듈을 안 탐 — 서버 판정).
// null = 실제 벽시계(게임 시간대: 낮 4~20시 · 밤 20시~다음 4시).
// ⚠️ 이 스토어는 "시간대 설정"이지 별도 개념이 아니다 — 밤 시스템은 game/time.ts가 유일 근원.

const KEY = 'pf-time-override';
let override: string | null = null;
try {
  override = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
} catch { /* SSR/비보안 — null 유지 */ }

const listeners = new Set<() => void>();

function persist(v: string | null) {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch { /* 저장 실패 무해 */ }
}

/** iso(ISO datetime)로 시간대를 고정. null = 실제 벽시계 복귀 */
export function setTimeOverride(iso: string | null): void {
  if (override === iso) return;
  override = iso;
  persist(iso);
  for (const l of listeners) l();
}

/** 현재 고정값 — LocalBackend가 dispatch의 now로 읽는다 (null = 실제 시각) */
export function getTimeOverride(): string | null {
  return override;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const getSnapshot = (): string | null => override;

/** 구독 훅 — AdminTab 시간대 설정이 표시에 쓴다 */
export function useTimeOverride(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** 테스트 리셋 — 모듈 전역이라 케이스 사이에 초기화해야 한다(resetCanvasCover 계약) */
export function resetTimeOverride(): void {
  if (override === null) return;
  override = null;
  persist(null);
  for (const l of listeners) l();
}
