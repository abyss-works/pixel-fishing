import { useSyncExternalStore } from 'react';
import { getReducedMotion, subscribeReducedMotion } from '../../../platform/api/reducedMotion';

export { getReducedMotion, subscribeReducedMotion };

/** OS 동작 축소 설정이 켜져 있는가 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getReducedMotion);
}
