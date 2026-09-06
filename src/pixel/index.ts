// R17, R19: 캔버스 픽셀 렌더링 배럴 — 외부 에셋 없이 코드로 그림 (디자인 시스템)
// 계층 구조 (웹 UI 계층 철학의 캔버스 판):
//   common.ts   프리미티브(R/label/팔레트/해상도) — DOM의 엘리먼트 격
//   styles.ts   물/통행판/라벨 스타일 토큰 — index.css 토큰의 캔버스 판
//   sprites/    단위 스프라이트(fish/buildings/actors/scenery/overlays) — ui/ 단위 컴포넌트 격
//   scenes/     컴포지터(region/base/worldmap/camera) — 배치·순서만 결정, 그리기는 위임 (layout 격)
// 입력 데이터(RegionPack/BasePack)는 world/ 소관 — 렌더러는 상태를 소유하지 않는다.
export { UI, W, H, SCALE, CANVAS_W, CANVAS_H, FIELD_W, FIELD_H, BASE_CANVAS_W, BASE_CANVAS_H } from './common.js';
export type { Ctx } from './common.js';
export { drawFishSprite } from './sprites/fish.js';
export type { FishShape } from './sprites/fish.js';
export { renderRegion } from './scenes/region.js';
export type { FieldView } from './scenes/region.js';
export { renderBase } from './scenes/base.js';
export { renderWorldMap, minimapView, MINIMAP_VIEW_W, MINIMAP_VIEW_H } from './scenes/worldmap.js';
// 주의 — scenes/atlas.ts(세계지도)는 여기에 재수출하지 않는다. earth 마스크(~178KB)가 들어있어
// WorldMapModal이 동적 import로만 불러온다 — 배럴에 넣으면 초기 번들에 녹아든다.
