// 세계지도 아틀라스 — 순환 플레이와 무관한 "지구 전체 조망" 정적 지도 (R23b).
// 필드 데이터가 아니라 **그림**이다: 충돌·수역 판정 없음, 미니맵 클릭으로 열리는 로드맵 비전.
// 경로는 확정 노선(world-lore 4절): 0 고향 → 1 태평양 → 2 동남아&오세아니아 → 3 인도양
//   → 4 대서양 → 5 미국 근해 → 6 북극 → 7 남극. 실제 위경도를 아틀라스 좌표로 수동 투영했다
//   (lon [-128,182]° → x [0,960], lat [82,-70]° → y [0,500]).
import { R, label, UI } from '../common.js';
import type { Ctx } from '../common.js';

export const ATLAS_W = 960, ATLAS_H = 500;

type Piece = { x: number; y: number; w: number; h: number };

const SAND = '#e9c46a', GRASS = '#74c69d', GRASS_HI = '#8fd6b0';
const ICE = '#eceff1', ICE_RIM = '#b3e5fc';

// 육지 — 섬/대륙별 rect 조립 (필드와 같은 다각 조립 패턴)
const LANDS: Piece[] = [
  // ── 북아메리카 ──
  { x: 20, y: 60, w: 150, h: 50 },
  { x: 0, y: 75, w: 30, h: 40 },
  { x: 10, y: 105, w: 160, h: 45 },
  { x: 25, y: 145, w: 140, h: 40 },
  { x: 60, y: 180, w: 80, h: 35 },
  { x: 120, y: 205, w: 45, h: 18 },
  { x: 158, y: 175, w: 12, h: 14 }, // 플로리다
  // ── 그린란드 ──
  { x: 215, y: 5, w: 85, h: 58 },
  { x: 245, y: 55, w: 40, h: 18 },
  // ── 카리브 ──
  { x: 138, y: 196, w: 20, h: 6 }, // 쿠바
  { x: 164, y: 200, w: 8, h: 5 },
  // ── 남아메리카 ──
  { x: 148, y: 228, w: 85, h: 42 },
  { x: 190, y: 250, w: 100, h: 60 },
  { x: 160, y: 290, w: 110, h: 60 },
  { x: 168, y: 340, w: 70, h: 55 },
  { x: 178, y: 385, w: 34, h: 45 }, // 파타고니아
  // ── 유럽 ──
  { x: 380, y: 85, w: 110, h: 60 },
  { x: 430, y: 45, w: 45, h: 40 }, // 스칸디나비아
  { x: 370, y: 88, w: 7, h: 10 },  // 아일랜드
  { x: 378, y: 84, w: 10, h: 16 }, // 영국
  { x: 334, y: 52, w: 14, h: 9 },  // 아이슬란드
  // ── 아시아(러시아~중동~인도~동아시아) ──
  { x: 490, y: 40, w: 300, h: 60 }, // 시베리아
  { x: 878, y: 66, w: 18, h: 38 },  // 캄차카
  { x: 480, y: 95, w: 180, h: 55 }, // 중앙아시아
  { x: 512, y: 150, w: 68, h: 55 }, // 아라비아
  { x: 600, y: 130, w: 70, h: 55 }, // 인도
  { x: 615, y: 180, w: 30, h: 62 }, // 인도 남단
  { x: 655, y: 100, w: 115, h: 70 },// 중국
  { x: 766, y: 110, w: 16, h: 26 }, // 만주
  { x: 779, y: 126, w: 15, h: 38 }, // 한반도
  { x: 700, y: 165, w: 40, h: 30 }, // 화남
  { x: 712, y: 190, w: 30, h: 45 }, // 인도차이나
  { x: 722, y: 232, w: 10, h: 24 }, // 말레이 반도
  // ── 일본 열도 ──
  { x: 798, y: 158, w: 12, h: 22 },
  { x: 806, y: 140, w: 16, h: 30 },
  { x: 826, y: 120, w: 16, h: 40 },
  { x: 838, y: 108, w: 18, h: 22 },
  // ── 동남아 제도 ──
  { x: 766, y: 188, w: 7, h: 11 },  // 대만
  { x: 768, y: 208, w: 12, h: 26 }, // 루손
  { x: 776, y: 236, w: 18, h: 8 },  // 비사야
  { x: 780, y: 244, w: 14, h: 16 }, // 민다나오
  { x: 736, y: 244, w: 44, h: 44 }, // 보르네오
  { x: 688, y: 250, w: 18, h: 14 }, // 수마트라 ↘
  { x: 697, y: 260, w: 18, h: 14 },
  { x: 706, y: 270, w: 18, h: 14 },
  { x: 714, y: 280, w: 16, h: 13 },
  { x: 720, y: 298, w: 32, h: 9 },  // 자바
  { x: 762, y: 264, w: 12, h: 22 }, // 술라웨시
  { x: 800, y: 274, w: 56, h: 26 }, // 뉴기니
  { x: 848, y: 282, w: 18, h: 14 },
  // ── 오세아니아 ──
  { x: 748, y: 330, w: 60, h: 45 }, // 호주 서부
  { x: 770, y: 308, w: 55, h: 30 }, // 호주 북부
  { x: 800, y: 330, w: 74, h: 55 }, // 호주 중북~퀸즐랜드
  { x: 786, y: 370, w: 70, h: 28 }, // 호주 남부
  { x: 924, y: 382, w: 9, h: 20 },  // 뉴질랜드
  { x: 931, y: 400, w: 8, h: 16 },
  { x: 888, y: 290, w: 6, h: 4 },   // 솔로몬
  { x: 942, y: 326, w: 6, h: 5 },   // 피지
  // ── 인도양 ──
  { x: 646, y: 238, w: 7, h: 9 },   // 스리랑카
  { x: 622, y: 256, w: 4, h: 12 },  // 몰디브
  { x: 530, y: 306, w: 16, h: 46 }, // 마다가스카르
  // ── 아프리카 ──
  { x: 350, y: 158, w: 155, h: 45 },
  { x: 344, y: 195, w: 200, h: 65 },
  { x: 520, y: 235, w: 36, h: 26 }, // 아프리카의 뿔
  { x: 380, y: 255, w: 165, h: 70 },
  { x: 400, y: 320, w: 120, h: 45 },
  { x: 420, y: 355, w: 75, h: 35 },
];

// 얼음 — 극지방 (1-6 북극 · 1-7 남극의 예고편)
const ICE_N: Piece[] = [
  { x: 0, y: 0, w: ATLAS_W, h: 10 },
  { x: 30, y: 8, w: 170, h: 8 },
  { x: 230, y: -2, w: 90, h: 12 },
  { x: 480, y: 8, w: 300, h: 10 },
];
const ICE_S: Piece[] = [
  { x: 0, y: 486, w: ATLAS_W, h: 14 },
  { x: 100, y: 478, w: 220, h: 10 },
  { x: 430, y: 476, w: 250, h: 12 },
  { x: 750, y: 480, w: 170, h: 10 },
];

// 특화 수역 — 구현된 것은 진하게, 설계된 예정 수역은 반투명
const DEEP_SPOTS: Piece[] = [
  { x: 834, y: 212, w: 26, h: 30 }, // 마리아나 해구 (1-1, 출시)
  { x: 758, y: 238, w: 46, h: 44 }, // 코럴 트라이앵글 (1-2, 출시 예정)
  { x: 862, y: 300, w: 24, h: 28 }, // 산호해 (1-2)
];
const PLAN_SPOTS: Piece[] = [
  { x: 565, y: 384, w: 125, h: 50 }, // 남인도양 (1-3 설계됨)
];

// 확정 노선 웨이포인트 — 번호 = 지역 번호 (region-design 1절)
const ROUTE: { n: string; x: number; y: number; name?: string }[] = [
  { n: '0', x: 790, y: 146, name: '고향' },
  { n: '1', x: 560, y: 196, name: '태평양' },
  { n: '2', x: 735, y: 218 },
  { n: '3', x: 600, y: 320, name: '인도양' },
  { n: '4', x: 262, y: 210, name: '대서양' },
  { n: '5', x: 95, y: 168, name: '미국 근해' },
  { n: '6', x: 300, y: 30, name: '북극' },
  { n: '7', x: 300, y: 488, name: '남극' },
];

const CONTINENTS: { t: string; x: number; y: number }[] = [
  { t: '아시아', x: 660, y: 118 },
  { t: '유럽', x: 432, y: 100 },
  { t: '아프리카', x: 440, y: 272 },
  { t: '북아메리카', x: 105, y: 112 },
  { t: '남아메리카', x: 215, y: 325 },
  { t: '오스트레일리아', x: 812, y: 352 },
  { t: '그린란드', x: 258, y: 32 },
];

function drawPieces(ctx: Ctx, ps: Piece[], fill: string) {
  for (const p of ps) R(ctx, p.x, p.y, p.w, p.h, fill);
}

export function renderAtlas(ctx: Ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // 바다
  R(ctx, 0, 0, ATLAS_W, ATLAS_H, '#1d6396');

  // 특화 수역 (육지보다 아래) — 터콰이즈 채움 + 밝은 리임
  for (const p of PLAN_SPOTS) R(ctx, p.x, p.y, p.w, p.h, 'rgba(91,135,184,0.45)');
  for (const p of DEEP_SPOTS) {
    R(ctx, p.x - 2, p.y - 2, p.w + 4, p.h + 4, '#7fe0d4');
    R(ctx, p.x, p.y, p.w, p.h, '#189a8f');
    R(ctx, p.x + 2, p.y + 2, Math.max(p.w - 4, 2), 2, 'rgba(190,255,238,0.6)');
  }

  // 육지 — 모래테 + 초록 + 상단 하이라이트 (큰 조각만 질감)
  for (const p of LANDS) {
    R(ctx, p.x - 2, p.y - 2, p.w + 4, p.h + 4, SAND);
    R(ctx, p.x, p.y, p.w, p.h, GRASS);
    if (p.w >= 40 && p.h >= 24) R(ctx, p.x + 2, p.y + 2, p.w - 4, 2, GRASS_HI);
  }
  // 질감 점 — 큰 조각에 어두운 초록 스펙클
  for (const p of LANDS) {
    if (p.w < 60 || p.h < 40) continue;
    for (let i = 0; i < Math.floor((p.w * p.h) / 900); i++) {
      const tx = p.x + 4 + (i * 37) % Math.max(p.w - 8, 1);
      const ty = p.y + 4 + (i * 23) % Math.max(p.h - 8, 1);
      R(ctx, tx, ty, 2, 2, '#2d6a4f');
    }
  }

  // 얼음
  drawPieces(ctx, ICE_N.map(p => ({ ...p, y: p.y })), ICE_RIM);
  drawPieces(ctx, ICE_N, ICE);
  drawPieces(ctx, ICE_S.map(p => ({ ...p, y: p.y - 2 })), ICE_RIM);
  drawPieces(ctx, ICE_S, ICE);

  // 항로 — 점선 (고향에서 남극까지, gold 잔물결)
  ctx.fillStyle = 'rgba(255,213,79,0.35)';
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i], b = ROUTE[i + 1];
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 7);
    for (let s = 1; s < steps; s++) {
      const px = a.x + (b.x - a.x) * s / steps, py = a.y + (b.y - a.y) * s / steps;
      ctx.fillRect(px | 0, py | 0, 2, 2);
    }
  }

  // 대륙 이름 (워터마크)
  for (const c of CONTINENTS) label(ctx, c.t, c.x, c.y, 'rgba(242,247,251,0.45)', 9);

  // 예정 수역 이름
  label(ctx, '남인도양', 627, 412, 'rgba(242,247,251,0.5)', 8);
  label(ctx, '마리아나', 847, 250, 'rgba(242,247,251,0.5)', 7);
  label(ctx, '코럴 트라이앵글', 781, 290, 'rgba(242,247,251,0.5)', 7);

  // 노선 번호 + 이름 — 고향에서 시작하는 한 바퀴
  for (const r of ROUTE) {
    if (r.name) label(ctx, r.name, r.x, r.y - 12, UI.gold, 9);
    label(ctx, r.n, r.x, r.y, UI.gold, 11);
  }
}
