// 원화 PNG → 인덱스 격자 변환 CLI.
// 사용: pnpm exec tsx tools/sprite-draft/import-png.ts <png 폴더> [out.ts]
// 폴더의 <id>.png / <id>.variant.png 를 읽어 색마다 팔레트 슬롯(고정 hex)을 매기고
// src/game/content/sprites/fishSprites.generated.ts 를 다시 쓴다. preview-*.png 는 건너뛴다.
// 알파가 0이면 투명, 그 외는 불투명으로 본다(반투명 픽셀은 거부 — 픽셀아트는 2값 알파).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './pngDecode';
import { INDEX_CHARS, TRANSPARENT } from '../../src/game/content/sprites/types';

const [, , dir, outArg] = process.argv;
if (!dir) { console.error('usage: import-png.ts <png dir> [out.ts]'); process.exit(1); }
const out = outArg ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../src/game/content/sprites/fishSprites.generated.ts');

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

interface Converted { key: string; w: number; h: number; palette: string[]; rows: string[] }

function convert(file: string): Converted {
  const { w, h, px } = decodePng(readFileSync(file));
  const palette: string[] = [];
  const index = new Map<string, number>();
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = px[i + 3];
      if (a === 0) { row += TRANSPARENT; continue; }
      if (a !== 255) throw new Error(`${basename(file)}: semi-transparent pixel at ${x},${y} (alpha ${a})`);
      const c = hex(px[i], px[i + 1], px[i + 2]);
      let idx = index.get(c);
      if (idx === undefined) {
        idx = palette.length;
        if (idx >= INDEX_CHARS.length) throw new Error(`${basename(file)}: more than ${INDEX_CHARS.length} colors`);
        palette.push(c);
        index.set(c, idx);
      }
      row += INDEX_CHARS[idx];
    }
    rows.push(row);
  }
  const key = basename(file, '.png'); // "<id>" 또는 "<id>.variant"
  return { key, w, h, palette, rows };
}

const files = readdirSync(dir).filter(f => f.endsWith('.png') && !f.startsWith('preview-')).sort();
const sprites = files.map(f => convert(join(dir, f)));
const sizes = new Set(sprites.map(s => `${s.w}x${s.h}`));
if (sizes.size !== 1) throw new Error(`mixed sizes: ${[...sizes].join(', ')}`);

const entries = sprites.map(s => {
  const pal = s.palette.map(c => `'${c}'`).join(', ');
  const rows = s.rows.map(r => `      '${r}',`).join('\n');
  return `  '${s.key}': {\n    w: ${s.w}, h: ${s.h},\n    palette: [${pal}],\n    frames: [[\n${rows}\n    ]],\n  },`;
});

const src = `// 생성 파일 — 손으로 고치지 않는다. 원화 PNG에서 다시 만들려면:
//   pnpm exec tsx tools/sprite-draft/import-png.ts tools/sprite-draft/png/fish
// 키는 "<어종 id>" 와 "<어종 id>.variant". 팔레트는 원화 색 그대로(고정 hex)라 기준색을 쓰지 않는다.
import type { PixelSprite } from './types.js';

export const FISH_SPRITES_GENERATED: Readonly<Record<string, PixelSprite>> = {
${entries.join('\n')}
};
`;
writeFileSync(out, src);
const maxColors = Math.max(...sprites.map(s => s.palette.length));
console.log(`${sprites.length} sprites (${[...sizes][0]}, max ${maxColors} colors) → ${out}`);
