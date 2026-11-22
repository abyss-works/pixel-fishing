import { useSyncExternalStore } from 'react';
import {
  getPhaseOverride,
  getTimeOverride,
  resetPhaseOverride,
  resetTimeOverride,
  setPhaseOverride,
  setTimeOverride,
  subscribePhaseOverride,
  subscribeTimeOverride,
} from '../../../platform/api/timeOverride';
import type { PhaseOverride } from '../../../platform/api/timeOverride';

export {
  getPhaseOverride,
  resetPhaseOverride,
  resetTimeOverride,
  setPhaseOverride,
  setTimeOverride,
};
export type { PhaseOverride };

export function useTimeOverride(): string | null {
  return useSyncExternalStore(
    subscribeTimeOverride,
    getTimeOverride,
    getTimeOverride,
  );
}

export function usePhaseOverride(): PhaseOverride {
  return useSyncExternalStore(
    subscribePhaseOverride,
    getPhaseOverride,
    getPhaseOverride,
  );
}
