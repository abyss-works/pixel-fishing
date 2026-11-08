import type { FacilityLabel } from './types';

/** 제목과 설명을 한 줄로 잇는다 — Canvas 라벨처럼 한 줄 문자열이 필요한 곳에서 쓴다 */
export function facilityLabelText(label: FacilityLabel): string {
  return label.sub ? `${label.title} ${label.sub}` : label.title;
}
