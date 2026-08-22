// 필드 컴포지터 — RegionPack 데이터를 해석해 "무엇을 어디에 어떤 순서로"만 결정한다.
// 직접 그리지 않는다: 그리기는 전부 sprites/(단위)와 styles.ts(토큰)에 위임 (계층: layout).
// 지역 고유 연출은 pack.flavor 훅 하나만 허용 — 지형/건물을 훅에서 그리지 않는다.
import { R, SCALE } from '../common.js';
import type { Ctx } from '../common.js';
import { WATER_STYLE } from '../styles.js';
import { BUILDING_SPRITES } from '../sprites/buildings.js';
import { drawBoat, drawPerson } from '../sprites/actors.js';
import { drawDeck, drawLabel, drawLand, drawTree, drawWater } from '../sprites/scenery.js';
import { drawFishingGear, drawSchools, drawTimingBar } from '../sprites/overlays.js';
import { cameraFor } from './camera.js';
import type { RegionPack } from '../../world/types';
import type { GearView } from '../sprites/overlays.js';

/** React 상태 → 캔버스 경계 뷰모델 — Field.tsx가 프레임마다 채워 보낸다.
    phase는 문자열로 받는다 — 렌더러는 게임 규칙 타입(FishingPhase)을 모른다 (계층 절단). */
export interface FieldView extends GearView {
  boat: number;
}

export function renderRegion(ctx: Ctx, pack: RegionPack, v: FieldView) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const cam = cameraFor(v.player, pack.w, pack.h);
  ctx.save();
  ctx.translate(-(cam.x | 0), -(cam.y | 0));

  // 바탕
  if (pack.ground.kind === 'grass') {
    R(ctx, 0, 0, pack.w, pack.h, pack.ground.color);
    for (let i = 0; i < 80; i++) R(ctx, (i * 97) % pack.w, (i * 61) % pack.h, 2, 2, pack.ground.dot);
  } else {
    R(ctx, 0, 0, pack.w, pack.h, WATER_STYLE[pack.ground.style].fill);
  }

  // 물 조각 → 물결 → 대륙/통행판 (물결이 통행판 아래 깔리도록 순서 고정)
  const waters = pack.terrain.filter(t => t.kind === 'water');
  for (const t of waters) drawWater(ctx, t);

  if (pack.ground.kind === 'water') {
    // 열린 바다 — 지도 전체에 물결
    for (let i = 0; i < pack.waveCount; i++) {
      const wx = (i * 89 + Math.sin(v.t * 0.8 + i) * 8 + pack.w) % pack.w;
      const wy = (i * 53) % pack.h;
      R(ctx, wx, wy, 7, 1, 'rgba(255,255,255,0.16)');
    }
  } else if (waters.length) {
    // 내륙 수역 — 물 조각들을 순환하며 물결
    for (let i = 0; i < pack.waveCount; i++) {
      const wx = (i * 83 + Math.sin(v.t + i) * 6 + pack.w) % pack.w;
      const body = waters[i % waters.length].rect;
      R(ctx, Math.max(body.x, Math.min(wx, body.x + body.w - 8)),
        body.y + 6 + (i * 7) % Math.max(body.h - 10, 1), 8, 1, 'rgba(255,255,255,0.25)');
    }
  }

  for (const t of pack.terrain) {
    if (t.kind === 'land') drawLand(ctx, t.rect);
    else if (t.kind === 'deck') drawDeck(ctx, t);
  }

  // 건물 → 장식 → 라벨 → 지역 연출
  for (const b of pack.buildings) BUILDING_SPRITES[b.sprite].draw(ctx, b.rect);
  for (const d of pack.decorations) drawTree(ctx, d.x, d.y);
  for (const l of pack.labels) drawLabel(ctx, l);
  pack.flavor?.(ctx, v.t);

  // 동적: 군집/낚싯줄/플레이어/타이밍 바
  drawSchools(ctx, pack.schools, v.boat, v.t);
  drawFishingGear(ctx, v);
  if (pack.movement === 'sail') drawBoat(ctx, v.player.x, v.player.y, v.t);
  else drawPerson(ctx, v.player.x, v.player.y);
  drawTimingBar(ctx, v);

  ctx.restore();
}
