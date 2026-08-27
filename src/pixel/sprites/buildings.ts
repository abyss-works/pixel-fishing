// 건물·가구 스프라이트 레지스트리 — 전부 rect 상대 좌표로 그린다 (리팩토링 축 2).
// rect는 충돌/히트 박스이고, 지붕·계단 같은 장식은 rect 밖으로 삐져나올 수 있다.
// 새 지역/거점의 건물 = 여기 항목 추가가 전부다. mapColor는 월드맵 축소판의 플랫 색(없으면 지도 생략).
import { R } from '../common.js';
import type { Ctx } from '../common.js';
import { drawFishSprite } from './fish.js';
import type { BuildingSpriteId, Furniture, FurnitureSpriteId, Rect } from '../../world/types';

interface BuildingSprite { draw: (ctx: Ctx, r: Rect) => void; mapColor?: string }

export const BUILDING_SPRITES: Record<BuildingSpriteId, BuildingSprite> = {
  // 마을 집 외관 — 붉은 지붕 + 문 + 창
  house: {
    mapColor: '#a1887f',
    draw: (ctx, r) => {
      R(ctx, r.x, r.y + 14, r.w, r.h - 14, '#a1887f');
      R(ctx, r.x - 4, r.y, r.w + 8, 16, '#b71c1c');
      R(ctx, r.x + 24, r.y + 34, 16, 32, '#4e342e');
      R(ctx, r.x + 8, r.y + 24, 12, 12, '#a5d8ff');
    },
  },
  // 목공소 — 지붕 + 서쪽 문(포구 쪽 트리거 방향) + 작업 중인 배 골격
  boatshop: {
    mapColor: '#546e7a',
    draw: (ctx, r) => {
      R(ctx, r.x, r.y + 8, r.w, r.h - 8, '#8d6e63');
      R(ctx, r.x - 3, r.y, r.w + 6, 12, '#546e7a');
      R(ctx, r.x + 2, r.y + 16, 10, 16, '#4e342e');
      R(ctx, r.x + r.w - 18, r.y + 16, 12, 8, '#a5d8ff');
      R(ctx, r.x + 8, r.y + r.h - 8, r.w - 24, 4, '#a1887f');
    },
  },
  // 항구 외관 — 붉은 지붕 창고 + 크레인 (접안 부두는 지형 deck 조각)
  harbor: {
    draw: (ctx, r) => {
      R(ctx, r.x + 2, r.y + 10, 18, 14, '#a1887f');
      R(ctx, r.x, r.y + 6, 22, 6, '#b71c1c');
      R(ctx, r.x + 26, r.y + 2, 3, 22, '#546e7a');
      R(ctx, r.x + 26, r.y + 2, 12, 2, '#546e7a');
    },
  },
};

type FurnitureDraw = (ctx: Ctx, f: Furniture) => void;

export const FURNITURE_SPRITES: Record<FurnitureSpriteId, FurnitureDraw> = {
  // 집: 책장(도감) — 3단 × 5권, 색 순환
  bookshelf: (ctx, f) => {
    R(ctx, f.x, f.y, f.w, f.h, '#4e342e');
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 5; i++) {
        R(ctx, f.x + 4 + i * 7, f.y + 6 + row * 18, 5, 12,
          ['#e57373', '#4fc3f7', '#ffd54f', '#81c784', '#ba68c8'][(i + row) % 5]);
      }
    }
  },
  // 집: 작업대(낚싯대 강화) — 상판 + 다리 + 세워 둔 낚싯대
  workbench: (ctx, f) => {
    R(ctx, f.x, f.y + 14, f.w, 8, '#4e342e');
    R(ctx, f.x + 4, f.y + 22, 5, 12, '#4e342e');
    R(ctx, f.x + f.w - 9, f.y + 22, 5, 12, '#4e342e');
    R(ctx, f.x + 8, f.y - 6, 2, 22, '#8d6e63');
    R(ctx, f.x + 10, f.y - 6, 16, 1, '#ccc');
  },
  // 집: 판매 궤짝
  chest: (ctx, f) => {
    R(ctx, f.x, f.y + 6, f.w, f.h - 6, '#8d6e63');
    R(ctx, f.x, f.y, f.w, 8, '#a1887f');
    R(ctx, f.x + f.w / 2 - 3, f.y + 8, 6, 8, '#ffd54f');
  },
  // 집: 문(마을로)
  door: (ctx, f) => {
    R(ctx, f.x, f.y, f.w, f.h, '#4e342e');
    R(ctx, f.x + 3, f.y + 3, f.w - 6, f.h - 6, '#5d4037');
    R(ctx, f.x + f.w - 9, f.y + f.h / 2 - 2, 4, 4, '#ffd54f');
  },
  // 항구: 항만 사무소(도감) — 문 + 창 + 간판
  office: (ctx, f) => {
    R(ctx, f.x, f.y + 10, f.w, f.h - 10, '#a1887f');
    R(ctx, f.x - 3, f.y, f.w + 6, 12, '#37474f');
    R(ctx, f.x + 6, f.y + 22, 12, 14, '#4e342e');
    R(ctx, f.x + 24, f.y + 20, 11, 10, '#a5d8ff');
    R(ctx, f.x + 4, f.y + 42, f.w - 8, 12, '#4e342e');
    R(ctx, f.x + 6, f.y + 44, f.w - 12, 8, '#ffe0b2');
  },
  // 항구: 낚시 공방 — 붉은 차양 + 진열 낚싯대 3대
  rodshop: (ctx, f) => {
    R(ctx, f.x, f.y + 14, f.w, 8, '#4e342e');
    R(ctx, f.x + 4, f.y + 22, 5, 12, '#4e342e');
    R(ctx, f.x + f.w - 9, f.y + 22, 5, 12, '#4e342e');
    R(ctx, f.x, f.y - 2, f.w, 6, '#b71c1c');
    for (let i = 0; i < 3; i++) {
      R(ctx, f.x + 10 + i * 12, f.y + 2, 2, 14, '#8d6e63');
      R(ctx, f.x + 12 + i * 12, f.y + 2, 7, 1, '#ccc');
    }
  },
  // 항구: 어시장 — 파란 차양 + 얼음 진열대 + 생선 2마리
  market: (ctx, f) => {
    R(ctx, f.x, f.y + 8, f.w, f.h - 8, '#8d6e63');
    R(ctx, f.x, f.y - 2, f.w, 6, '#1d6396');
    R(ctx, f.x + 3, f.y + 10, f.w - 6, 10, '#e3f2fd');
    drawFishSprite(ctx, f.x + 12, f.y + 15, 'slim', '#42a5f5', 1);
    drawFishSprite(ctx, f.x + 30, f.y + 15, 'round', '#e57373', 1);
  },
  // 항구: 조선소 — 건조대 위 선체 + 돛
  shipyard: (ctx, f) => {
    R(ctx, f.x, f.y + f.h - 6, f.w, 6, '#546e7a');
    R(ctx, f.x + 8, f.y + 12, f.w - 16, 7, '#8d6e63');
    R(ctx, f.x + f.w / 2 - 1, f.y + 2, 2, 10, '#6d4c41');
    R(ctx, f.x + f.w / 2 + 1, f.y + 3, 9, 7, '#e0e0e0');
  },
  // 항구: 승선(출항) — 발판 + 내 배 돛대
  boarding: (ctx, f) => {
    R(ctx, f.x + 2, f.y + 30, f.w - 4, 10, '#8d6e63');
    R(ctx, f.x + 4, f.y + 40, f.w - 8, 3, '#6d4c41');
    R(ctx, f.x + f.w / 2 - 1, f.y + 14, 2, 16, '#6d4c41');
    R(ctx, f.x + f.w / 2 + 1, f.y + 15, 10, 9, '#e0e0e0');
    R(ctx, f.x - 4, f.y + f.h - 8, 14, 3, '#a1887f');
  },
  // 항구: 미끼 상점 — 빨간 차양 + 선반 병 3개
  shop: (ctx, f) => {
    R(ctx, f.x, f.y + 8, f.w, f.h - 8, '#6d4c41');
    R(ctx, f.x, f.y - 2, f.w, 6, '#c62828');
    R(ctx, f.x + 4, f.y + 10, f.w - 8, 12, '#efebe9');
    R(ctx, f.x + 7, f.y + 13, 3, 7, '#ba68c8');
    R(ctx, f.x + 14, f.y + 13, 3, 7, '#42a5f5');
    R(ctx, f.x + 21, f.y + 13, 3, 7, '#ffd54f');
  },
  // 항구: 여객선(마을로) — 흰 선체 + 선실 + 굴뚝
  ferry: (ctx, f) => {
    R(ctx, f.x + 2, f.y + 14, f.w - 4, 12, '#e0e0e0');
    R(ctx, f.x + 6, f.y + 8, f.w - 20, 7, '#90a4ae');
    R(ctx, f.x + 8, f.y + 26, f.w - 12, 3, '#37474f');
    R(ctx, f.x + f.w - 14, f.y + 4, 4, 10, '#b71c1c');
  },
};
