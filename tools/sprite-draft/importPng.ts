// 원화 PNG 폴더 → 대상별 생성 파일 원문. 크기는 대상 정의의 격자로 검증하고, 색마다 팔레트 슬롯(고정 hex)을 매긴다.
// 알파가 0이면 투명, 255면 불투명이며 반투명 픽셀은 거부한다(픽셀아트는 2값 알파).
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './pngDecode';
import { definedLayout } from '../../src/game/content/sprites/targets';
import type { SpriteTarget } from '../../src/game/content/sprites/targets';
import { INDEX_CHARS, TRANSPARENT } from '../../src/game/content/sprites/types';

const here = dirname(fileURLToPath(import.meta.url));

/** 대상의 원화 PNG 폴더 */
export const pngDir = (kind: string): string => resolve(here, 'png', kind);
/** 대상의 생성 파일 */
export const generatedPath = (kind: string): string => resolve(here, '../../src/game/content/sprites', `${kind}Sprites.generated.ts`);

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
  return { key: basename(file, '.png'), w, h, palette, rows };
}

export interface ImportResult { source: string; count: number; maxColors: number }

/** `dir`의 `<id>.png`(상태에 variant가 있는 대상은 `<id>.variant.png`도)를 읽어 생성 파일 원문을 만든다. preview-*.png는 건너뛴다.
 *  variant 상태가 없는 대상에 `<id>.variant.png`가 있으면 거부한다. */
export function importTarget(target: SpriteTarget, dir: string): ImportResult {
  const { grid } = definedLayout(target);
  if (target.palette !== 'per-sprite') throw new Error(`${target.kind}: 공용 팔레트를 쓰는 코드 생성 대상이라 PNG에서 가져오지 않습니다`);
  const files = readdirSync(dir).filter(f => f.endsWith('.png') && !f.startsWith('preview-')).sort();
  if (files.length === 0) throw new Error(`${dir}: PNG 원화가 없습니다`);
  if (!target.states.includes('variant')) {
    const stray = files.find(f => f.endsWith('.variant.png'));
    if (stray) throw new Error(`${stray}: ${target.kind}에는 variant 상태가 없습니다`);
  }
  const sprites = files.map(f => convert(join(dir, f)));
  for (const s of sprites) {
    if (s.w !== grid.w || s.h !== grid.h) throw new Error(`${s.key}.png: ${s.w}x${s.h}, ${target.kind} 정의는 ${grid.w}x${grid.h}`);
  }

  const entries = sprites.map(s => {
    const pal = s.palette.map(c => `'${c}'`).join(', ');
    const rows = s.rows.map(r => `      '${r}',`).join('\n');
    return `  '${s.key}': {\n    w: ${s.w}, h: ${s.h},\n    palette: [${pal}],\n    frames: [[\n${rows}\n    ]],\n  },`;
  });
  const id = target.idLabel ?? 'id';
  const keys = target.states.includes('variant') ? `키는 "<${id}>" 와 "<${id}>.variant".` : `키는 "<${id}>".`;
  const source = `// 생성 파일 — 손으로 고치지 않는다. 원화 PNG에서 다시 만들려면:
//   pnpm exec tsx tools/sprite-draft/import-png.ts ${target.kind}
// ${keys} 팔레트는 원화 색 그대로(고정 hex)라 기준색을 쓰지 않는다.
import type { PixelSprite } from './types.js';

export const ${target.kind.toUpperCase()}_SPRITES_GENERATED: Readonly<Record<string, PixelSprite>> = {
${entries.join('\n')}
};
`;
  return { source, count: sprites.length, maxColors: Math.max(...sprites.map(s => s.palette.length)) };
}
