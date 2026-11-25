import { useSyncExternalStore } from 'react';
import type { ProfileStatus } from './types';

// useGame이 부트스트랩 중 읽은 프로필의 비동기 상태 — 조립 파일(App)을 거치지 않는 하위 화면에서도
// '불러오는 중' / '미설정' / '불러오기 실패'를 구분하도록 공유한다. props로 전달되면 props를 우선한다.
let sharedStatus: ProfileStatus | null = null;
const listeners = new Set<() => void>();

const emit = () => { for (const fn of listeners) fn(); };

export function setSharedProfileStatus(next: ProfileStatus | null): void {
  if (sharedStatus === next) return;
  sharedStatus = next;
  emit();
}

export function getSharedProfileStatus(): ProfileStatus | null {
  return sharedStatus;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useProfileStatus(): ProfileStatus | null {
  return useSyncExternalStore(subscribe, getSharedProfileStatus, getSharedProfileStatus);
}
