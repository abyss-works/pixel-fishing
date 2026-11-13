// 가상 해역 등록부 — 덮어쓰기가 더한 해역의 지역과 가상 어종을 기억한다.
// 제품의 지역 표는 해역 id로만 읽혀 가상 해역을 모르므로, 측정 모델이 이 등록부를 먼저 본다.
const zones = new Map<string, string>();
const fishIds = new Set<string>();

/** 가상 해역의 지역. 가상 해역이 아니면 undefined */
export const virtualZoneOf = (spot: string): string | undefined => zones.get(spot);

/** 가상 해역이 더한 어종인가 — 실제 지역의 도감 조건에는 세지 않는다 */
export const isVirtualFish = (id: string): boolean => fishIds.has(id);

export function registerVirtualSpot(spot: string, zone: string): void { zones.set(spot, zone); }
export function registerVirtualFish(id: string): void { fishIds.add(id); }
export function unregisterVirtualSpot(spot: string): void { zones.delete(spot); }
export function unregisterVirtualFish(id: string): void { fishIds.delete(id); }
