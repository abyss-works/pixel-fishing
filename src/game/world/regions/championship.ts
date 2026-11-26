// 이벤트 전용 구역: 강태공 분지 호수 (Wave 0 최소 자리표시자 — 상세 지형·어군은 Wave 1B에서 구현한다).
import type { RegionPack } from '../types';

export const CHAMPIONSHIP_W = 448;
export const CHAMPIONSHIP_H = 360;

export const CHAMPIONSHIP: RegionPack = {
  id: 'championship',
  name: '강태공 분지 호수',
  base: 'home',
  info: {
    shortName: '분지 호수',
    tagline: '이벤트 기간에만 열리는 고요한 분지 호수',
    lore: '화산 분지 한가운데 맑은 물이 고인 호수다. 대회 기간에만 들어설 수 있으며, 각지에서 모여든 희귀한 어종들이 수면 아래를 맴돈다.',
    tips: [
      '이벤트 창에서 언제든 분지 호수로 들어오고 나갈 수 있어요.',
      '표준 낚싯대가 적용되어 보유 배와 무관하게 공정하게 겨룰 수 있어요.',
    ],
    controls: [
      '이동: 방향키 또는 WASD',
      '낚시: 어군 옆에서 스페이스(또는 화면 누르기)',
    ],
  },
  bounds: { x: 0, y: 0, w: CHAMPIONSHIP_W, h: CHAMPIONSHIP_H },
  movement: 'walk',
  ground: { kind: 'grass', color: '#74c69d', dot: '#5fb389', mapColor: '#4c7c5e' },
  waveCount: 0,
  terrain: [],
  buildings: [],
  decorations: [],
  spawn: { x: 224, y: 180 },
  triggers: [],
  labels: [],
};
