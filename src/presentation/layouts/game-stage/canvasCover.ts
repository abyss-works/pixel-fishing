import { useSyncExternalStore } from 'react';

// 게임 스테이지 렌더를 가리는 관리자용 표시 설정. 세이브가 아닌 브라우저 설정으로 저장한다.
const KEY = 'pf-canvas-cover';
try {
  var initial = typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
} catch { var initial = false; }
let covered = initial;

const listeners = new Set<() => void>();

function persist(value: boolean) {
  try {
    if (value) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* 저장 실패 무해 */ }
}

export function setCanvasCover(value: boolean): void {
  if (covered === value) return;
  covered = value;
  persist(value);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = (): boolean => covered;

/** 스테이지와 게임 셸이 함께 구독하는 표시 상태 */
export function useCanvasCover(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** 테스트 리셋 — 모듈 전역이라 케이스 사이에 새로 시작해야 한다 */
export function resetCanvasCover(): void {
  if (!covered) return;
  covered = false;
  for (const listener of listeners) listener();
}
