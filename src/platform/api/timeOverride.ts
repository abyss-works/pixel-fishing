// 로컬 게임 어댑터용 시간 저장소를 feature에 공개하는 API 경계.
export {
  getTimeOverride,
  resetTimeOverride,
  setTimeOverride,
  subscribeTimeOverride,
} from '../adapters/timeOverride';
