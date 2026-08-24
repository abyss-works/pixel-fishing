// 필드 컴포지터 — 지역 데이터를 해석해 "무엇을 어디에 어떤 순서로"만 결정한다.
// 직접 그리지 않는다: 그리기는 전부 sprites/(단위)와 styles.ts(토큰)에 위임 (계층: layout).
// 지형 소스는 둘 — 항해 지역은 마스크(sprites/mask 페인터), walk 지역은 rect 조각(scenery).
// 지역 고유 연출은 pack.flavor 훅 하나만 허용 — 지형/건물을 훅에서 그리지 않는다.
import { R, SCALE, CANVAS_W, CANVAS_H } from '../common.js';
import type { Ctx } from '../common.js';
import { BUILDING_SPRITES } from '../sprites/buildings.js';
import { drawBoat, drawPerson } from '../sprites/actors.js';
import { drawMaskTerrain } from '../sprites/mask.js';
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

  const openSea = !!pack.map; // mask 지역 = 전역이 바다 / village = 초지 내륙 수역

  if (pack.map) {
    // 마스크 지형 — 육지·특화 수역이 격자에 들어 있다 (t = 구름 그림자·글린트 연출)
    drawMaskTerrain(ctx, pack.map, true, v.t);
  } else {
    // rect 지형 (village) — 초지 바탕 + 물 조각
    const g = pack.ground!;
    R(ctx, 0, 0, pack.w, pack.h, g.color);
    for (let i = 0; i < 80; i++) R(ctx, (i * 97) % pack.w, (i * 61) % pack.h, 2, 2, g.dot);
    for (const t of pack.terrain!) if (t.kind === 'water') drawWater(ctx, t);
  }

  // 물결 — 열린 바다는 지도 전체, 내륙 수역은 조각 위를 순환
  if (openSea) {
    for (let i = 0; i < pack.waveCount; i++) {
      const wx = (i * 89 + Math.sin(v.t * 0.8 + i) * 8 + pack.w) % pack.w;
      const wy = (i * 53) % pack.h;
      R(ctx, wx, wy, 7, 1, 'rgba(255,255,255,0.16)');
    }
  } else {
    const waters = pack.terrain!.filter(t => t.kind === 'water');
    for (let i = 0; i < pack.waveCount && waters.length; i++) {
      const wx = (i * 83 + Math.sin(v.t + i) * 6 + pack.w) % pack.w;
      const body = waters[i % waters.length].rect;
      R(ctx, Math.max(body.x, Math.min(wx, body.x + body.w - 8)),
        body.y + 6 + (i * 7) % Math.max(body.h - 10, 1), 8, 1, 'rgba(255,255,255,0.25)');
    }
  }

  // 육지/통행판 (rect 지형) 또는 통행판만 (마스크 지형)
  if (pack.map) {
    for (const d of pack.decks ?? []) drawDeck(ctx, { kind: 'deck', rect: d.rect, style: d.style });
  } else {
    for (const t of pack.terrain!) {
      if (t.kind === 'land') drawLand(ctx, t.rect);
      else if (t.kind === 'deck') drawDeck(ctx, t);
    }
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

  // 비네팅 — 화장 가장자리를 어둡게 덮어 수중 압박감 (스크린 공간 후처리)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vg = ctx.createRadialGradient(
    CANVAS_W / 2, CANVAS_H * 0.42, CANVAS_H * 0.38,
    CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.62,
  );
  vg.addColorStop(0, 'rgba(4,9,18,0)');
  vg.addColorStop(1, 'rgba(4,9,18,0.34)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.restore();
}
