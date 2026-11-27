import { recordCanvasFrame } from '../../../platform/api';

/** 필드 캔버스 프레임 경과 시간을 플랫폼 계측 수집기로 중계한다 */
export function reportCanvasFrame(elapsedMs: number): void {
  recordCanvasFrame(elapsedMs);
}
