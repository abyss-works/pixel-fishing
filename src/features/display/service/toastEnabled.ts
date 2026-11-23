import { useSyncExternalStore } from 'react';
import {
  getToastEnabled,
  resetToastEnabled,
  setToastEnabled,
  subscribeToastEnabled,
} from '../../../platform/api/toastEnabled';

export { getToastEnabled, resetToastEnabled, setToastEnabled };

/** 주요 알림 플로팅 토스트를 보이는가 — 켜고 끔은 이 기기에 남아 다음 접속에도 이어진다 */
export function useToastEnabled(): boolean {
  return useSyncExternalStore(subscribeToastEnabled, getToastEnabled, getToastEnabled);
}
