// 플로팅 토스트 표시 여부 저장소를 기능 계층에 공개하는 API 경계.
export {
  getToastEnabled,
  resetToastEnabled,
  setToastEnabled,
  subscribeToastEnabled,
} from '../adapters/toastEnabled';
