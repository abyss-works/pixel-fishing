import { useSyncExternalStore } from 'react';
import { getSpotState, subscribeSpotState } from '../../../game/world/currentSpot.js';

export function useSpotState() {
  return useSyncExternalStore(subscribeSpotState, getSpotState, getSpotState);
}
