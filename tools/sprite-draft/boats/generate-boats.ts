// 배 스프라이트 생성 CLI — 6단계 배를 32×16 격자로 칠해 생성 파일을 쓴다.
// 사용: npx vite-node tools/sprite-draft/boats/generate-boats.ts [sheet.png]
// 뱃머리는 왼쪽(어종과 같은 방향). 흘수선은 13행, 그 아래 2행은 물에 잠긴 선체.
// 팔레트는 6척이 공유하는 고정 hex — 색 규칙: 나무 선체 3톤 · 돛 2톤 · 돛대 · 붉은 포인트 ·
// 금속 2톤 · 연기 · 창 불빛. 윤곽은 렌더러가 덧그린다.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grid } from './grid';
import { outlineCells } from '../../../src/game/content/sprites/types';
import { Bitmap } from '../png';

const W = 32, H = 16, WL = 13; // 흘수선 행

const PALETTE = [
  '#8d6e63', // 0 선체
  '#5d4037', // 1 선체 어둡게
  '#b39b8f', // 2 선체 밝게(현측 띠)
  '#e8dcc8', // 3 갑판·장식
  '#f4efe6', // 4 돛
  '#cfc3b0', // 5 돛 음영·돛살
  '#3e2723', // 6 돛대·밧줄
  '#c62828', // 7 붉은 포인트
  '#8fa3ad', // 8 금속
  '#4a5a63', // 9 금속 어둡게
  '#c8d2d8', // 10 연기
  '#ffd54f', // 11 창 불빛
];
const C = { hull: 0, hullD: 1, hullL: 2, deck: 3, sail: 4, sailS: 5, mast: 6, red: 7, metal: 8, metalD: 9, smoke: 10, win: 11 };

/** 나무 선체 — 뱃머리(왼쪽)는 위로 들리고 고물(오른쪽)은 raise만큼 높다. 밑면은 안쪽으로 좁아진다 */
function woodHull(g: Grid, x0: number, x1: number, raise = 0) {
  g.hline(x0 + 1, x1 - 1, WL - 1, C.hullL);          // 현측 밝은 띠
  g.hline(x0, x1, WL, C.hull);
  g.hline(x0 + 1, x1 - 1, WL + 1, C.hull);
  g.hline(x0 + 2, x1 - 2, WL + 2, C.hullD);           // 잠긴 밑면
  g.put(x0, WL - 1, C.hull); g.put(x0, WL - 2, C.hullL);           // 뱃머리 들림
  for (let i = 0; i <= raise; i++) g.hline(x1 - 2, x1, WL - 1 - i, i === raise ? C.hullL : C.hull); // 고물
  g.hline(x0 + 2, x1 - 3, WL - 2, C.deck);            // 갑판선
}

function rowboat(g: Grid) {
  woodHull(g, 9, 22);
  g.put(9, WL - 2, C.hull);
  g.hline(12, 19, WL - 2, C.deck);
  // 노 — 갑판에서 뒤쪽 물속으로
  g.put(17, WL - 3, C.mast); g.put(18, WL - 2, C.mast); g.put(19, WL - 1, C.mast); g.put(20, WL + 1, C.mast);
}

function sailboat(g: Grid) {
  woodHull(g, 7, 24);
  g.vline(16, 1, WL - 2, C.mast);
  g.poly([[17, 2], [17, 10], [24, 10]], C.sail);        // 주돛(돛대 뒤)
  g.vline(18, 4, 9, C.sailS); g.vline(21, 7, 9, C.sailS);
  g.poly([[15, 3], [15, 10], [9, 10]], C.sail);         // 앞돛
  g.vline(13, 6, 9, C.sailS);
  g.hline(10, 24, 10, C.mast);                          // 붐
  g.put(16, 0, C.red); g.put(17, 0, C.red);             // 깃발
}

function junk(g: Grid) {
  woodHull(g, 5, 27, 2);
  for (const mx of [12, 21]) {
    g.vline(mx, 1, WL - 2, C.mast);
    // 가로 돛살이 든 사각 돛 — 돛대 뒤로 넓게
    g.rect(mx + 1, 2, 6, 8, C.sail);
    for (let y = 3; y <= 9; y += 2) g.hline(mx + 1, mx + 6, y, C.sailS);
    g.vline(mx + 6, 2, 9, C.red);                        // 돛 가장자리 붉은 띠
  }
  g.hline(6, 11, 11, C.deck);
}

function tallShip(g: Grid) {
  woodHull(g, 3, 29, 1);
  g.hline(0, 3, 10, C.mast); g.put(1, 9, C.mast);        // 바우스프릿
  for (const mx of [9, 16, 23]) {
    g.vline(mx, 0, WL - 2, C.mast);
    g.rect(mx - 2, 1, 5, 3, C.sail); g.hline(mx - 2, mx + 2, 3, C.sailS);   // 윗돛
    g.rect(mx - 3, 5, 7, 4, C.sail); g.hline(mx - 3, mx + 3, 8, C.sailS);   // 아랫돛
  }
  g.put(16, 0, C.red); g.put(17, 0, C.red);
  g.hline(4, 28, 10, C.deck);
}

function steamer(g: Grid) {
  // 금속 선체 — 검은 띠 + 밝은 상부
  g.hline(3, 29, WL - 1, C.metal);
  g.hline(2, 29, WL, C.metalD);
  g.hline(3, 28, WL + 1, C.metalD);
  g.hline(4, 27, WL + 2, C.metalD);
  g.put(2, WL - 2, C.metal);
  g.hline(4, 28, WL - 2, C.deck);
  g.rect(11, 8, 12, 4, C.deck);                          // 선실
  g.hline(12, 21, 9, C.metal);
  for (let x = 13; x <= 21; x += 2) g.put(x, 10, C.win);
  g.rect(16, 3, 3, 5, C.metalD);                         // 굴뚝
  g.hline(16, 18, 3, C.red);
  g.put(15, 2, C.smoke); g.put(14, 1, C.smoke); g.put(13, 1, C.smoke); g.put(12, 0, C.smoke);
  g.vline(8, 5, WL - 3, C.mast);                         // 앞 돛대
  g.put(8, 4, C.red);
}

function liner(g: Grid) {
  g.hline(2, 30, WL - 1, C.metal);
  g.hline(1, 30, WL, C.metalD);
  g.hline(2, 29, WL + 1, C.metalD);
  g.hline(3, 28, WL + 2, C.metalD);
  g.put(1, WL - 2, C.metal); g.put(1, WL - 3, C.metal);
  g.hline(3, 29, WL - 2, C.deck);
  g.rect(7, 7, 20, 5, C.deck);                           // 긴 선실
  g.rect(9, 5, 15, 2, C.deck);                           // 윗층
  for (let x = 8; x <= 26; x += 2) g.put(x, 9, C.win);
  for (let x = 10; x <= 23; x += 2) g.put(x, 6, C.win);
  g.hline(8, 26, 11, C.metal);
  for (const fx of [12, 19]) {                            // 굴뚝 2개
    g.rect(fx, 1, 3, 4, C.metalD);
    g.hline(fx, fx + 2, 1, C.red);
    g.put(fx - 1, 0, C.smoke); g.put(fx - 2, 0, C.smoke);
  }
  g.vline(5, 4, WL - 3, C.mast); g.vline(28, 5, WL - 3, C.mast);
  g.put(5, 3, C.red);
}

const BOATS: { tier: number; name: string; paint: (g: Grid) => void }[] = [
  { tier: 1, name: '조각배', paint: rowboat },
  { tier: 2, name: '돛단배', paint: sailboat },
  { tier: 3, name: '정크선', paint: junk },
  { tier: 4, name: '범선', paint: tallShip },
  { tier: 5, name: '증기선', paint: steamer },
  { tier: 6, name: '대양선', paint: liner },
];

const grids = BOATS.map(b => { const g = new Grid(W, H); b.paint(g); return { ...b, rows: g.rows() }; });

const entries = grids.map(b => `  ${b.tier}: { // ${b.name}
    w: ${W}, h: ${H},
    palette: BOAT_PALETTE,
    frames: [[
${b.rows.map(r => `      '${r}',`).join('\n')}
    ]],
  },`);

const src = `// 생성 파일 — 손으로 고치지 않는다. 다시 만들려면: npx vite-node tools/sprite-draft/boats/generate-boats.ts
// 배 6단계 스프라이트(32×16, 뱃머리 왼쪽). 흘수선은 13행 — 필드에서는 그 행을 수면에 맞춘다.
import type { PixelSprite } from './types.js';

export const BOAT_PALETTE: readonly string[] = ${JSON.stringify(PALETTE)};
/** 흘수선 행 — 필드 배치 기준(y = 수면 - BOAT_WATERLINE) */
export const BOAT_WATERLINE = ${WL};

export const BOAT_SPRITES: Readonly<Record<number, PixelSprite>> = {
${entries.join('\n')}
};
`;
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(resolve(here, '../../../src/game/content/sprites/boatSprites.generated.ts'), src);

// 시안 시트 — 2× 와 4×, 윤곽 포함, 수면선 표시
const sheet = process.argv[2];
if (sheet) {
  const GAP = 10, S2 = 2, S4 = 4, WATER = '#0f2a44', OUT = '#182540', SEA = '#1b4b6e';
  const bmp = new Bitmap(GAP + W * S2 + GAP + W * S4 + GAP, GAP + grids.length * (H * S4 + GAP));
  bmp.fill(0, 0, bmp.w, bmp.h, WATER);
  grids.forEach((b, i) => {
    const oy = GAP + i * (H * S4 + GAP);
    for (const [s, ox] of [[S2, GAP], [S4, GAP + W * S2 + GAP]] as const) {
      bmp.fill(ox, oy + (WL + 1) * s, W * s, (H - WL - 1) * s, SEA); // 수면 아래
      for (const [x, y] of outlineCells(b.rows)) bmp.fill(ox + x * s, oy + y * s, s, s, OUT);
      b.rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === '.') return;
        bmp.fill(ox + x * s, oy + y * s, s, s, PALETTE[parseInt(ch, 36)]);
      }));
    }
  });
  writeFileSync(sheet, bmp.png());
}
console.log(`${grids.length} boats → boatSprites.generated.ts${sheet ? `, sheet ${sheet}` : ''}`);
