import { BOATS, boatNameOf } from '../../../game/content/boats';

/** 개발 도구 스탯 설정에서 고를 수 있는 배 단계 — 배 표가 정본이다 */
export function selectAdminBoatOptions(): Array<{ tier: number; name: string }> {
  return BOATS.map(boat => ({ tier: boat.tier, name: boatNameOf(boat.tier) }));
}
