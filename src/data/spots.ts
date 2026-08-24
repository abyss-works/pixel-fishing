// 수역 데이터 — 새 수역 추가 시 여기 행 추가만으로 SpotId까지 자동 확장
// boatTier 0 = 배 없이 가능(마을), 1+ = 대양(배 필요). region = 소속 지역(도감 계층·지역 탭 분류)
const DATA = [
  { id: 'pond',  name: '마을 연못',     boatTier: 0, region: 'village' },
  { id: 'river', name: '마을 강',       boatTier: 0, region: 'village' },
  { id: 'sea',   name: '태평양',        boatTier: 1, region: 'ocean' },
  { id: 'deep',  name: '마리아나 해구', boatTier: 2, region: 'ocean' },
  // 동남아&오세아니아 — 일반 수역 없이 특화 3수역(군집은 특화에만 둔다)
  { id: 'dragonhole',  name: '드래곤 홀',         boatTier: 3, region: 'seasia' },
  { id: 'coron',       name: '코론 침선 지대',    boatTier: 3, region: 'seasia' },
  { id: 'barrierreef', name: '그레이트 배리어 리프', boatTier: 3, region: 'seasia' },
] as const;

export type SpotId = (typeof DATA)[number]['id'];
export type SpotRegionId = (typeof DATA)[number]['region'];

export interface Spot {
  id: SpotId;
  name: string;
  boatTier: number;
  region: SpotRegionId;
}

export const SPOTS: readonly Spot[] = DATA;
