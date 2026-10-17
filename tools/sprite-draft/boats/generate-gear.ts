// 장비 스프라이트 생성 CLI — 낚싯대 1종을 32×16 격자로 칠해 생성 파일을 쓴다.
// 사용: pnpm exec tsx tools/sprite-draft/boats/generate-gear.ts [sheet.png]
// 낚싯대는 레벨과 무관하게 한 그림이다(강화 화면 머리용). 손잡이는 왼쪽 아래, 초리는 오른쪽 위.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grid } from './grid';
import { outlineCells } from '../../../src/game/content/sprites/types';
import { Bitmap } from '../png';

const W = 32, H = 16;
const PALETTE = ['#8d6e63', '#5d4037', '#b39b8f', '#4a5a63', '#8fa3ad', '#f4efe6', '#ffd54f'];
const C = { rod: 0, rodD: 1, rodL: 2, reel: 3, reelL: 4, line: 5, lure: 6 };

function rod(g: Grid) {
  // 대 — 손잡이(3,13)에서 초리(29,2)까지 2px 사선, 아래쪽은 어둡게
  for (let i = 0; i <= 26; i++) {
    const x = 3 + i, y = Math.round(13 - (i * 11) / 26);
    g.put(x, y, i < 6 ? C.rodD : C.rod);
    g.put(x, y + 1, C.rodD);
    if (i > 6 && i % 3 === 0) g.put(x, y, C.rodL);
  }
  // 손잡이 — 굵게
  g.rect(2, 12, 5, 3, C.rodD); g.hline(2, 6, 12, C.rodL);
  // 릴 — 손잡이 앞 아래
  g.rect(8, 11, 4, 4, C.reel); g.put(9, 12, C.reelL); g.put(10, 12, C.reelL); g.put(12, 13, C.reelL);
  // 줄 — 초리에서 아래로, 끝에 루어
  g.vline(29, 3, 11, C.line); g.put(29, 12, C.lure); g.put(28, 13, C.lure); g.put(29, 13, C.lure);
}

const g = new Grid(W, H); rod(g);
const rows = g.rows();
const src = `// 생성 파일 — 손으로 고치지 않는다. 다시 만들려면: pnpm exec tsx tools/sprite-draft/boats/generate-gear.ts
// 장비 스프라이트(32×16). 낚싯대는 레벨과 무관한 한 그림이다.
import type { PixelSprite } from './types.js';

export const GEAR_PALETTE: readonly string[] = ${JSON.stringify(PALETTE)};

export const ROD_SPRITE: PixelSprite = {
  w: ${W}, h: ${H},
  palette: GEAR_PALETTE,
  frames: [[
${rows.map(r => `    '${r}',`).join('\n')}
  ]],
};
`;
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(resolve(here, '../../../src/game/content/sprites/gearSprites.generated.ts'), src);

const sheet = process.argv[2];
if (sheet) {
  const S = 4, GAP = 8, OUT = '#182540';
  const bmp = new Bitmap(GAP + W * S + GAP, GAP + H * S + GAP);
  bmp.fill(0, 0, bmp.w, bmp.h, '#0f2a44');
  for (const [x, y] of outlineCells(rows)) bmp.fill(GAP + x * S, GAP + y * S, S, S, OUT);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') bmp.fill(GAP + x * S, GAP + y * S, S, S, PALETTE[parseInt(ch, 36)]); }));
  writeFileSync(sheet, bmp.png());
}
console.log(`rod → gearSprites.generated.ts${sheet ? `, sheet ${sheet}` : ''}`);
