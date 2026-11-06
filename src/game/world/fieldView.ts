import { FIELD_VIEW_W, FIELD_VIEW_H } from './types';

/** 필드 카메라 시야의 크기(월드 픽셀) */
export interface ViewSize { w: number; h: number }

/** PC 필드 시야 */
export const FIELD_VIEW: ViewSize = { w: FIELD_VIEW_W, h: FIELD_VIEW_H };

/** 모바일 필드 시야의 폭 */
const MOBILE_VIEW_W = 252;

/** 모바일 필드 시야 — 폭은 252 월드 픽셀이고, 높이는 스테이지 비율(스테이지 높이 ÷ 폭 × 252)에서 소수를 버린다.
 *  스테이지 크기를 아직 모르면(0) PC 시야를 돌려준다. */
export function mobileFieldView(stageW: number, stageH: number): ViewSize {
  if (!(stageW > 0 && stageH > 0)) return FIELD_VIEW;
  return { w: MOBILE_VIEW_W, h: Math.floor(stageH / stageW * MOBILE_VIEW_W) };
}
