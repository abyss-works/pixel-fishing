// 거점 인터프리터 — BasePack 데이터(가구 목록)를 그리는 유일한 거점 렌더러 (리팩토링 축 2).
// 구 renderHome/renderHarbor(시설별 switch 손코딩)를 대체한다. 배경(backdrop)은 거점 고유
// 연출이라 id 키 레지스트리로 남긴다 — 새 거점 = BasePack + backdrop 1개 + 가구 스프라이트.
import { R, label, UI, SCALE, W, H } from '../common.js';
import type { Ctx } from '../common.js';
import { FURNITURE_SPRITES } from '../sprites/buildings.js';
import type { BaseId, BaseInfo, BasePack } from '../../world/types';

const BACKDROPS: Record<BaseId, (ctx: Ctx) => void> = {
  // 집 실내 — 벽/바닥/창(마을 풍경)
  home: ctx => {
    R(ctx, 0, 0, W, H, '#6d4c41');
    R(ctx, 0, 124, W, 56, '#8d6e63');
    for (let i = 0; i < W; i += 32) R(ctx, i, 124, 1, 56, '#795548');
    R(ctx, 96, 34, 44, 34, '#a5d8ff');
    R(ctx, 98, 56, 40, 10, '#74c69d');
    R(ctx, 94, 32, 48, 3, '#4e342e'); R(ctx, 94, 67, 48, 3, '#4e342e');
    R(ctx, 94, 32, 3, 38, '#4e342e'); R(ctx, 139, 32, 3, 38, '#4e342e');
  },
  // 항구 부두 — 하늘/구름/바다/판자 바닥
  harbor: ctx => {
    R(ctx, 0, 0, W, 96, '#8ecae6');
    R(ctx, 40, 26, 26, 4, '#fff'); R(ctx, 210, 16, 32, 4, '#fff');
    R(ctx, 0, 96, W, 28, '#3f8cb5');
    R(ctx, 0, 96, W, 1, 'rgba(255,255,255,0.5)');
    for (let i = 0; i < 8; i++) R(ctx, 10 + i * 40, 104 + (i % 3) * 5, 12, 1, 'rgba(255,255,255,0.35)');
    R(ctx, 0, 124, W, 56, '#8d6e63');
    for (let i = 0; i < W; i += 26) R(ctx, i, 124, 1, 56, '#795548');
    R(ctx, 0, 124, W, 2, '#a1887f');
  },
  // 마닐라항 부두 — 항구 배경에 열대 바다 톤만 입힌 판(구조 동일)
  manila: ctx => {
    R(ctx, 0, 0, W, 96, '#8ecae6');
    R(ctx, 40, 26, 26, 4, '#fff'); R(ctx, 210, 16, 32, 4, '#fff');
    R(ctx, 0, 96, W, 28, '#2f9d95');
    R(ctx, 0, 96, W, 1, 'rgba(255,255,255,0.5)');
    for (let i = 0; i < 8; i++) R(ctx, 10 + i * 40, 104 + (i % 3) * 5, 12, 1, 'rgba(255,255,255,0.35)');
    R(ctx, 0, 124, W, 56, '#8d6e63');
    for (let i = 0; i < W; i += 26) R(ctx, i, 124, 1, 56, '#795548');
    R(ctx, 0, 124, W, 2, '#a1887f');
  },
};

// 사람은 그리지 않는다 — 거점은 "들어와서 둘러보는 중" 1인칭 시점
export function renderBase(ctx: Ctx, pack: BasePack, info: BaseInfo) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  BACKDROPS[pack.id](ctx);
  for (const f of pack.furniture) {
    FURNITURE_SPRITES[f.sprite](ctx, f);
    label(ctx, f.label(info), f.x + f.w / 2, f.y + f.labelDy, UI.gold, 8);
  }
  label(ctx, pack.headline, W / 2, 14, UI.text, 10);
}
