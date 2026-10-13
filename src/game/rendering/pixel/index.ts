// R17, R19: 캔버스 픽셀 프리미티브 배럴 — 외부 에셋 없이 코드로 그림 (디자인 시스템)
// 단위 스프라이트까지만 둔다. 장면 합성은 별도로 관리하므로 여기서 재수출하지 않는다 —
// 렌더 파이프라인과 프리미티브를 같은 배럴에 두면
// earth 마스크(~178KB) 같은 무거운 지형이 초기 번들에 딸려들어온다.
// 입력 데이터(RegionPack/BasePack)는 월드 모델이 소유하며 렌더러는 상태를 소유하지 않는다.
export { UI, W, H, SCALE, CANVAS_W, CANVAS_H, FIELD_W, FIELD_H, BASE_CANVAS_W, BASE_CANVAS_H } from './common.js';
export type { Ctx } from './common.js';
export { drawFishSprite } from './sprites/fish.js';
export type { FishShape } from './sprites/fish.js';
// 주의 — 화면 계층(세계지도)는 이 배럴에 없다. earth 마스크(~178KB) 때문에
// WorldMapModal이 동적 import로만 불러온다 — 배럴에 넣으면 초기 번들에 녹아든다.
