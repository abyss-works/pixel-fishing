// 초안 생성기 → 인덱스 격자 변환 CLI.
// 사용: npx vite-node tools/sprite-draft/generate-fish-shapes.ts
// 14형태를 1× 배율로 32×16 기록 컨텍스트에 그리고, 쓰인 색을 팔레트 슬롯으로 환원해
// src/game/content/sprites/fishShapes.generated.ts 를 다시 쓴다.
// 색 환원 규칙: 기준색 → { shade: 1 }, shade(기준색, f) → { shade: f },
// 흰색 알파 a 덧칠 → { shade: 1 + a } (몸 위에만 칠해지므로 동치), 그 밖의 고정 색은 문자열 그대로.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SHAPES, drawFishSprite } from '../../src/game/rendering/pixel/fishArt/v1Shapes';
import type { RectCtx } from '../../src/game/rendering/pixel/fishArt/v1Shapes';
import { shade } from '../../src/shared/lib/color';
import { INDEX_CHARS, TRANSPARENT } from '../../src/game/content/sprites/types';
import type { PaletteSlot } from '../../src/game/content/sprites/types';
import type { FishShape } from '../../src/game/content/fish';

// 종별 원화와 같은 32×16 격자, 초안 생성기는 1× 배율로 그린다
const W = 32, H = 16, CX = 16, CY = 8, S = 1;
// 기준색 — 다른 어떤 고정 색과도 겹치지 않는 임의 값. 격자에는 슬롯만 남고 이 값은 사라진다.
const BASE = '#6a8bc3';
const SHADE_FACTORS = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 1.15];

function slotOf(fill: string): PaletteSlot {
  if (fill === BASE) return { shade: 1 };
  for (const f of SHADE_FACTORS) if (shade(BASE, f) === fill) return { shade: f };
  const m = /^rgba\(255,255,255,([\d.]+)\)$/.exec(fill);
  if (m) return { shade: 1 + Number(m[1]) };
  return fill;
}

const slotKey = (s: PaletteSlot) => (typeof s === 'string' ? s : `shade:${s.shade}`);

/** 기록 컨텍스트 — fillRect를 격자 셀의 슬롯 인덱스로 남긴다 */
class GridCtx implements RectCtx {
  fillStyle = '';
  readonly cells: (number | null)[][] = Array.from({ length: H }, () => Array<number | null>(W).fill(null));
  readonly palette: PaletteSlot[] = [];
  private readonly index = new Map<string, number>();

  fillRect(x: number, y: number, w: number, h: number): void {
    const slot = slotOf(this.fillStyle);
    const key = slotKey(slot);
    let idx = this.index.get(key);
    if (idx === undefined) {
      idx = this.palette.length;
      this.palette.push(slot);
      this.index.set(key, idx);
    }
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) throw new Error(`out of grid: (${xx},${yy})`);
        this.cells[yy][xx] = idx;
      }
    }
  }

  rows(): string[] {
    return this.cells.map(row => row.map(c => (c === null ? TRANSPARENT : INDEX_CHARS[c])).join(''));
  }
}

const shapes = Object.keys(SHAPES) as FishShape[];
const entries = shapes.map(shape => {
  const ctx = new GridCtx();
  drawFishSprite(ctx, CX, CY, shape, BASE, S, true);
  const palette = ctx.palette.map(s => (typeof s === 'string' ? JSON.stringify(s) : `{ shade: ${s.shade} }`)).join(', ');
  const rows = ctx.rows().map(r => `      '${r}',`).join('\n');
  return `  ${shape}: {\n    w: ${W}, h: ${H},\n    palette: [${palette}],\n    frames: [[\n${rows}\n    ]],\n  },`;
});

const out = `// 생성 파일 — 손으로 고치지 않는다. 다시 만들려면: npx vite-node tools/sprite-draft/generate-fish-shapes.ts
// 초안 생성기(절차 사각형)를 1× 배율로 32×16 격자에 옮긴 14형태 스프라이트.
// 종별 격자가 없는 어종(신규 어종 초안 단계)만 이 형태 격자를 쓴다 (fishSprite 해석 순서).
import type { PixelSprite } from './types.js';
import type { FishShape } from '../fish.js';

export const FISH_SHAPE_SPRITES: Record<FishShape, PixelSprite> = {
${entries.join('\n')}
};
`;

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/game/content/sprites/fishShapes.generated.ts');
writeFileSync(target, out);
console.log(`${shapes.length} shapes → ${target}`);
