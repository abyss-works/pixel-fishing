// 시간·낮/밤 재정의 저장소를 feature에 공개하는 API 경계.
export {
  getPhaseOverride,
  getTimeOverride,
  resetPhaseOverride,
  resetTimeOverride,
  setPhaseOverride,
  setTimeOverride,
  subscribePhaseOverride,
  subscribeTimeOverride,
} from '../adapters/timeOverride';
export type { PhaseOverride } from '../adapters/timeOverride';
