// 시안 시트 CLI — 어종 하나를 제품과 같은 규칙(팔레트·링·프리셋 배율)으로 PNG에 그린다.
// 사용: npx vite-node tools/sprite-draft/render-sheet.ts <fishId> <out.png>
// 행: 일반 · 변이 · 미발견 · (원화 격자가 있으면) 형태 격자 비교. 열: 1×(thumb/icon) · 2×(card) · 3×(portrait).
import { writeFileSync } from 'node:fs';
import { FISH } from '../../src/game/content/fish';
import { FISH_SHAPE_SPRITES, fishColors, fishRings, fishSprite } from '../../src/game/content/sprites';
import type { FishRings } from '../../src/game/content/sprites';
import { auraCells, cellIndex, outlineCells, paletteColors } from '../../src/game/content/sprites/types';
import type { PixelSprite } from '../../src/game/content/sprites/types';
import { Bitmap } from './png';

const [, , fishId, out] = process.argv;
const fish = FISH.find(f => f.id === fishId);
if (!fish || !out) { console.error('usage: render-sheet.ts <fishId> <out.png>'); process.exit(1); }

const WATER = '#0f2a44', GAP = 12, SCALES = [1, 2, 3];

interface Row { label: string; sprite: PixelSprite; colors: string[]; rings: FishRings }
const rows: Row[] = [
  { label: 'normal', sprite: fishSprite(fish), colors: fishColors(fish), rings: fishRings(fish) },
  { label: 'variant', sprite: fishSprite(fish, 'variant'), colors: fishColors(fish, 'variant'), rings: fishRings(fish) },
  { label: 'hidden', sprite: fishSprite(fish), colors: fishColors(fish, 'normal', false), rings: fishRings(fish, false) },
];
const shapeSprite = FISH_SHAPE_SPRITES[fish.shape];
if (fishSprite(fish) !== shapeSprite) {
  rows.push({ label: 'before', sprite: shapeSprite, colors: paletteColors(shapeSprite.palette, fish.color), rings: fishRings(fish) });
}

const cellW = (s: PixelSprite) => SCALES.reduce((acc, sc) => acc + s.w * sc + GAP, GAP);
const W = Math.max(...rows.map(r => cellW(r.sprite)));
const H = rows.reduce((acc, r) => acc + r.sprite.h * Math.max(...SCALES) + GAP, GAP);
const bmp = new Bitmap(W, H);
bmp.fill(0, 0, W, H, WATER);

function blit(s: PixelSprite, colors: string[], rings: FishRings, scale: number, ox: number, oy: number) {
  const grid = s.frames[0];
  const cell = (x: number, y: number, c: string) => bmp.fill(ox + x * scale, oy + y * scale, scale, scale, c);
  if (rings.aura) for (const [x, y] of auraCells(grid)) cell(x, y, rings.aura);
  if (rings.outline) for (const [x, y] of outlineCells(grid)) cell(x, y, rings.outline);
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const idx = cellIndex(row[x]);
      if (idx !== null) cell(x, y, colors[idx]);
    }
  });
}

let y = GAP;
for (const r of rows) {
  let x = GAP;
  const rowH = r.sprite.h * Math.max(...SCALES);
  for (const sc of SCALES) {
    blit(r.sprite, r.colors, r.rings, sc, x, y + Math.round((rowH - r.sprite.h * sc) / 2));
    x += r.sprite.w * sc + GAP;
  }
  y += rowH + GAP;
}
writeFileSync(out, bmp.png());
console.log(`${fish.name} (${fish.shape}) rows=${rows.map(r => r.label).join(',')} → ${out}`);
