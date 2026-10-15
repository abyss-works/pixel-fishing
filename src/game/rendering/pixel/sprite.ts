// 스프라이트 래스터라이저 — 인덱스 격자를 (색 배열, 배율, 프레임)당 한 번 오프스크린 캔버스로
// 굽고 drawImage로 찍는다. 배율은 정수만 받는다(픽셀아트 — 비정수는 번짐).
// 캐시는 스프라이트 객체를 키로 하는 WeakMap이라 데이터가 교체되면 함께 버려진다.
// jsdom에는 canvas가 없어 null을 돌려준다 — 호출자는 그리기를 건너뛴다.
import { cellIndex } from '../../content/sprites/types.js';
import type { PixelSprite } from '../../content/sprites/types.js';
import type { Ctx } from './common.js';

type Raster = HTMLCanvasElement;
const CACHE = new WeakMap<PixelSprite, Map<string, Raster | null>>();

export function rasterize(
  sprite: PixelSprite, colors: readonly string[], scale: number, frame = 0,
): Raster | null {
  let bucket = CACHE.get(sprite);
  if (!bucket) { bucket = new Map(); CACHE.set(sprite, bucket); }
  const key = `${colors.join('|')}@${scale}#${frame}`;
  const hit = bucket.get(key);
  if (hit !== undefined) return hit;

  const raster = bake(sprite, colors, scale, frame);
  bucket.set(key, raster);
  return raster;
}

function bake(sprite: PixelSprite, colors: readonly string[], scale: number, frame: number): Raster | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = sprite.w * scale;
  c.height = sprite.h * scale;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const rows = sprite.frames[frame] ?? sprite.frames[0];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const idx = cellIndex(row[x]);
      if (idx === null) continue;
      ctx.fillStyle = colors[idx];
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  return c;
}

/** 좌상단 (x, y)에 찍는다. flip이면 좌우 반전 — 물고기는 왼쪽을 보는 것이 기본 */
export function drawSprite(
  ctx: Ctx, sprite: PixelSprite, colors: readonly string[], scale: number,
  x: number, y: number, opts: { frame?: number; flip?: boolean } = {},
): void {
  const img = rasterize(sprite, colors, scale, opts.frame ?? 0);
  if (!img) return;
  const px = Math.round(x), py = Math.round(y);
  if (!opts.flip) { ctx.drawImage(img, px, py); return; }
  ctx.save();
  ctx.translate(px + img.width, py);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** 격자 중심을 (cx, cy)에 맞춰 찍는다 — 프리셋 캔버스 가운데 배치용 */
export function drawSpriteCentered(
  ctx: Ctx, sprite: PixelSprite, colors: readonly string[], scale: number,
  cx: number, cy: number, opts: { frame?: number; flip?: boolean } = {},
): void {
  drawSprite(ctx, sprite, colors, scale, cx - (sprite.w * scale) / 2, cy - (sprite.h * scale) / 2, opts);
}
