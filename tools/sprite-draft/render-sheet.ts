// 시안 시트 CLI — 원화 하나를 제품과 같은 규칙(팔레트·링·프리셋 배율)으로 PNG에 그린다.
// 사용: pnpm exec tsx tools/sprite-draft/render-sheet.ts <대상 종류> <id> <out.png>
// 행은 대상 정의의 상태 행, 열은 정의의 표시 프리셋 배율이다. 크기는 원화 격자를 따른다.
// 물고기는 제품 해석(fishSprite)을 그리고 원화 격자가 있으면 형태 격자 비교 행을 더한다.
// 그 밖의 대상은 tools/sprite-draft/png/<대상>/<id>.png 를 그린다.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FISH } from '../../src/game/content/fish';
import { FISH_SHAPE_SPRITES, fishColors, fishRings, fishSprite } from '../../src/game/content/sprites';
import { OUTLINE_DARK } from '../../src/game/content/sprites/common';
import { definedLayout, presetScales } from '../../src/game/content/sprites/targets';
import { cellIndex, outlineCells, paletteColors } from '../../src/game/content/sprites/types';
import type { PixelSprite } from '../../src/game/content/sprites/types';
import { Bitmap } from './png';
import { targetOf } from './cliArgs';
import { pngDir } from './importPng';
import { gridFromPng } from './styleMetrics';
import type { Grid } from './styleMetrics';

const [, , kindArg, id, out] = process.argv;
if (!id || !out) { console.error('usage: render-sheet.ts <kind> <id> <out.png>'); process.exit(1); }
const target = targetOf(kindArg);
const SCALES = presetScales(definedLayout(target));
const WATER = '#0f2a44', GAP = 12;

interface Row { label: string; grid: Grid; outline: string | null }

/** 스프라이트와 실제 색 배열을 색 격자로 푼다 */
function gridOf(sprite: PixelSprite, colors: string[]): Grid {
  const rows = sprite.frames[0];
  return { w: sprite.w, h: sprite.h, cells: rows.map(row => [...row].map(ch => { const i = cellIndex(ch); return i === null ? null : colors[i]; })) };
}

function fishRows(): { name: string; rows: Row[] } {
  const fish = FISH.find(f => f.id === id);
  if (!fish) throw new Error(`어종 id가 없습니다: ${id}`);
  const rows: Row[] = [];
  const shapeSprite = FISH_SHAPE_SPRITES[fish.shape];
  for (const state of target.states) {
    const form = state === 'variant' ? 'variant' : 'normal';
    const discovered = state !== 'hidden';
    rows.push({
      label: state,
      grid: gridOf(fishSprite(fish, form), fishColors(fish, form, discovered)),
      outline: fishRings(fish, discovered).outline ?? null,
    });
  }
  if (fishSprite(fish) !== shapeSprite) {
    rows.push({ label: 'before', grid: gridOf(shapeSprite, paletteColors(shapeSprite.palette, fish.color)), outline: fishRings(fish).outline ?? null });
  }
  return { name: `${fish.name} (${fish.shape})`, rows };
}

/** 물고기 밖의 대상은 상태가 default뿐인 원화 `<id>.png`를 그린다. 다른 상태가 있으면 거부한다 */
function pngRows(): { name: string; rows: Row[] } {
  if (target.palette !== 'per-sprite') throw new Error(`${target.kind}: PNG 원화가 없는 코드 생성 대상입니다`);
  const unsupported = target.states.find(label => label !== 'default');
  if (unsupported) throw new Error(`${target.kind}: 시트가 지원하지 않는 상태입니다: ${unsupported}`);
  const grid = gridFromPng(readFileSync(join(pngDir(target.kind), `${id}.png`)));
  return { name: `${target.kind} ${id}`, rows: target.states.map(label => ({ label, grid, outline: OUTLINE_DARK })) };
}

const { name, rows } = target.kind === 'fish' ? fishRows() : pngRows();
const maxScale = SCALES[SCALES.length - 1];
const cellW = (g: Grid) => SCALES.reduce((acc, sc) => acc + g.w * sc + GAP, GAP);
const W = Math.max(...rows.map(r => cellW(r.grid)));
const H = rows.reduce((acc, r) => acc + r.grid.h * maxScale + GAP, GAP);
const bmp = new Bitmap(W, H);
bmp.fill(0, 0, W, H, WATER);

function blit(r: Row, scale: number, ox: number, oy: number) {
  const cell = (x: number, y: number, c: string) => bmp.fill(ox + x * scale, oy + y * scale, scale, scale, c);
  if (r.outline) {
    const mask = r.grid.cells.map(row => row.map(c => (c ? '0' : '.')).join(''));
    for (const [x, y] of outlineCells(mask)) cell(x, y, r.outline);
  }
  r.grid.cells.forEach((row, y) => row.forEach((c, x) => { if (c) cell(x, y, c); }));
}

let y = GAP;
for (const r of rows) {
  let x = GAP;
  const rowH = r.grid.h * maxScale;
  for (const sc of SCALES) {
    blit(r, sc, x, y + Math.round((rowH - r.grid.h * sc) / 2));
    x += r.grid.w * sc + GAP;
  }
  y += rowH + GAP;
}
writeFileSync(out, bmp.png());
console.log(`${name} rows=${rows.map(r => r.label).join(',')} → ${out}`);
