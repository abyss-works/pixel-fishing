import { useSyncExternalStore } from 'react';

// 캔버스 덮개 — 관리자 대시보드(도구 탭)에서 게임 씬(Field/Base)의 캔버스를 가리는 토글.
// 조건부 렌더가 전부다: true면 스테이지가 자리만 남긴 빈 패널이 된다(렌더 루프 포함 정지).
// 세이브가 아닌 브라우저 사정이라 localStorage에 둔다(save-schema의 UI 플래그 규약).

const KEY = 'pf-canvas-cover';
try {
  var initial = typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
} catch { var initial = false; }
let covered = initial;

const listeners = new Set<() => void>();

function persist(v: boolean) {
  try {
    if (v) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* 저장 실패 무해 */ }
}

export function setCanvasCover(v: boolean): void {
  if (covered === v) return;
  covered = v;
  persist(v);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const getSnapshot = (): boolean => covered;

/** 구독 훅 — 덮개 상태. App의 씬 분기와 AdminTab 버튼이 같은 출처를 본다 */
export function useCanvasCover(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** 테스트 리셋 — 모듈 전역이라 케이스 사이에 새로 시작해야 한다(resetBagView 계약) */
export function resetCanvasCover(): void {
  if (!covered) return;
  covered = false;
  for (const l of listeners) l();
}
