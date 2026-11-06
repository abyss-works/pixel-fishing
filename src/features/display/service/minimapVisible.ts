import { useSyncExternalStore } from 'react';
import {
  getMinimapVisible,
  resetMinimapVisible,
  setMinimapVisible,
  subscribeMinimapVisible,
} from '../../../platform/api/minimapVisible';

export { resetMinimapVisible, setMinimapVisible };

/** 미니맵을 보이는가 — 숨김/표시는 이 기기에 남아 다음 접속에도 이어진다 */
export function useMinimapVisible(): boolean {
  return useSyncExternalStore(subscribeMinimapVisible, getMinimapVisible, getMinimapVisible);
}
