import { useSyncExternalStore } from 'react';
import {
  getTimeOverride,
  resetTimeOverride,
  setTimeOverride,
  subscribeTimeOverride,
} from '../../../platform/api/timeOverride';

export { resetTimeOverride, setTimeOverride };

export function useTimeOverride(): string | null {
  return useSyncExternalStore(
    subscribeTimeOverride,
    getTimeOverride,
    getTimeOverride,
  );
}
