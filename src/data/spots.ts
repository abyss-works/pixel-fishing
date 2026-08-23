// 수역 데이터 — 새 수역 추가 시 여기 행 추가만으로 SpotId까지 자동 확장 
// boatTier 0 = 배 없이 가능(마을), 1+ = 대양(배 필요). region = 소속 지역(도감 계층·지역 탭 분류)
const DATA = [
  { id: 'pond',  name: '마을 연못',     boatTier: 0, region: 'village' },
  { id: 'river', name: '마을 강',       boatTier: 0, region: 'village' },
  { id: 'sea',   name: '태평양',        boatTier: 1, region: 'ocean' },
  { id: 'deep',  name: '마리아나 해구', boatTier: 2, region: 'ocean' },
  { id: 'southchina', name: '남중국해',      boatTier: 3, region: 'seasia' },
  { id: 'coral',      name: '코럴 트라이앵글', boatTier: 3, region: 'seasia' },
  { id: 'coralsea',   name: '산호해',        boatTier: 3, region: 'seasia' },
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
