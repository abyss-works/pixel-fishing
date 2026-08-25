// 수역 데이터 — 새 수역 추가 시 여기 행 추가만으로 SpotId까지 자동 확장
// boatTier 0 = 배 없이 가능(마을), 1+ = 대양(배 필요). region = 소속 지역(도감 계층·지역 탭 분류)
// powerReq = 낚싯대 파워 요구량(stats.rodPower, **10단위 스냅** — 사용자 지시). 미달이면 그
// 수역에서 존이 사라지고 일반 가중치·입질 시간 페널티를 받는다(stats.powerZones 참조).
const DATA = [
  { id: 'pond',  name: '마을 연못',     boatTier: 0, region: 'village', powerReq: 10 }, // Lv1
  { id: 'river', name: '마을 강',       boatTier: 0, region: 'village', powerReq: 20 }, // Lv3
  { id: 'sea',   name: '태평양',        boatTier: 1, region: 'ocean', powerReq: 35 }, // Lv6
  { id: 'deep',  name: '마리아나 해구', boatTier: 2, region: 'ocean', powerReq: 40 }, // Lv7
  // 동남아&오세아니아 — 일반 수역 없이 특화 3수역(군집은 특화에만 둔다)
  { id: 'dragonhole',  name: '드래곤 홀',         boatTier: 3, region: 'seasia', powerReq: 55 }, // Lv10
  { id: 'coron',       name: '코론 침선 지대',    boatTier: 3, region: 'seasia', powerReq: 60 }, // Lv11
  { id: 'barrierreef', name: '그레이트 배리어 리프', boatTier: 3, region: 'seasia', powerReq: 65 }, // Lv12
] as const;

export type SpotId = (typeof DATA)[number]['id'];
export type SpotRegionId = (typeof DATA)[number]['region'];

export interface Spot {
  id: SpotId;
  name: string;
  boatTier: number;
  region: SpotRegionId;
  /** 낚싯대 파워 요구량 — 생략 시 제한 없음. 미달 페널티는 stats.powerGate 참조 */
  powerReq?: number;
}

export const SPOTS: readonly Spot[] = DATA;
