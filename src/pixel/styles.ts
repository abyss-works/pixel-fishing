// 캔버스 스타일 토큰 — index.css 디자인 토큰의 캔버스 판 (계층: 렌더링 토큰)
// 스프라이트/컴포지터는 색·간격을 하드코딩하지 않고 여기(또는 common.UI)를 참조한다.
// 새 수역/통행판 스타일 = 행 추가 (world 스키마의 WaterStyleId/DeckStyleId와 1:1).
import { UI } from './common.js';

export const WATER_STYLE = {
  pond:  { fill: '#3f8cb5', rim: '#e9c46a' },                          // 모래테 연못
  river: { fill: '#3a7fc1', edge: '#6ba3e5', edgeH: 2 },
  sea:   { fill: '#1d6396', edge: '#2a91c9', edgeH: 2 },
  deep:  { fill: '#0b2545', edge: 'rgba(255,255,255,0.08)', edgeH: 1 }, // 어두운 심해
  coral: { fill: '#189a8f', rim: '#7fe0d4' },                          // 열대 산호수(터콰이즈)
} as const;

export const DECK_STYLE = {
  bridge: { gap: 7 },
  pier: { gap: 6 },
} as const;

// 라벨 색 토큰 — 필드 라벨용 (세계지도(atlas)는 자체 팔레트를 쓴다)
export const FIELD_LABEL = { gold: UI.gold, text: UI.text, faint: 'rgba(242,247,251,0.45)' } as const;
