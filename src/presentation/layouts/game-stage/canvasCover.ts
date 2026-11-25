import { useSyncExternalStore } from 'react';

// 게임 스테이지 렌더를 가리는 개발용 표시 설정. 세이브가 아닌 브라우저 설정으로 저장하며
// 운영 빌드에서는 컴파일 타임 가드로 저장소 접근과 동작을 모두 제거한다.
const KEY = 'pf-canvas-cover';
declare const __DEPLOY_ENV__: string | undefined;
const DEV_TOOLS_ENABLED =
  typeof __DEPLOY_ENV__ !== 'undefined' &&
  (__DEPLOY_ENV__ === 'preview' || __DEPLOY_ENV__ === 'development' || __DEPLOY_ENV__ === 'local');

export function readInitialCanvasCover(enabled: boolean): boolean {
  if (!enabled) return false;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let covered = DEV_TOOLS_ENABLED ? readInitialCanvasCover(true) : false;

const listeners = new Set<() => void>();

function persist(value: boolean) {
  try {
    if (value) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* 저장 실패 무해 */ }
}

export function setCanvasCover(value: boolean): void {
  if (!DEV_TOOLS_ENABLED) return;
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
const getDisabledSnapshot = (): boolean => false;
const subscribeNoop = (): (() => void) => () => {};

/** 스테이지와 게임 셸이 함께 구독하는 표시 상태 */
export function useCanvasCover(): boolean {
  return useSyncExternalStore(
    DEV_TOOLS_ENABLED ? subscribe : subscribeNoop,
    DEV_TOOLS_ENABLED ? getSnapshot : getDisabledSnapshot,
  );
}

/** 테스트 리셋 — 모듈 전역이라 케이스 사이에 새로 시작해야 한다 */
export function resetCanvasCover(): void {
  if (!DEV_TOOLS_ENABLED) return;
  if (!covered) return;
  covered = false;
  for (const listener of listeners) listener();
}
