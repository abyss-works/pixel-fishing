// 스프라이트 래스터라이저 — 인덱스 격자를 (색 배열, 배율, 프레임, 윤곽)당 한 번 오프스크린 캔버스로
// 굽고 drawImage로 찍는다. 배율은 정수만 받는다(픽셀아트 — 비정수는 번짐).
// 캐시는 스프라이트 객체를 키로 하는 WeakMap이라 데이터가 교체되면 함께 버려진다.
// jsdom에는 canvas가 없어 null을 돌려준다 — 호출자는 그리기를 건너뛴다.
import { auraCells, cellIndex, opaqueBounds, outlineCells } from '../../content/sprites/types.js';
import type { PixelSprite } from '../../content/sprites/types.js';
import type { Ctx } from './common.js';

type Raster = HTMLCanvasElement;
const CACHE = new WeakMap<PixelSprite, Map<string, Raster | null>>();

/** 몸 둘레 링 — outline은 몸에 닿는 1칸(가독성), aura는 그 바깥 1칸(등급 표시) */
export interface Rings { outline?: string; aura?: string }

export function rasterize(
  sprite: PixelSprite, colors: readonly string[], scale: number, frame = 0, rings: Rings = {},
): Raster | null {
  let bucket = CACHE.get(sprite);
  if (!bucket) { bucket = new Map(); CACHE.set(sprite, bucket); }
  const key = `${colors.join('|')}@${scale}#${frame}~${rings.outline ?? ''}~${rings.aura ?? ''}`;
  const hit = bucket.get(key);
  if (hit !== undefined) return hit;

  const raster = bake(sprite, colors, scale, frame, rings);
  bucket.set(key, raster);
  return raster;
}

function bake(
  sprite: PixelSprite, colors: readonly string[], scale: number, frame: number, rings: Rings,
): Raster | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = sprite.w * scale;
  c.height = sprite.h * scale;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const rows = sprite.frames[frame] ?? sprite.frames[0];
  if (rings.aura) {
    ctx.fillStyle = rings.aura;
    for (const [x, y] of auraCells(rows)) ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  if (rings.outline) {
    ctx.fillStyle = rings.outline;
    for (const [x, y] of outlineCells(rows)) ctx.fillRect(x * scale, y * scale, scale, scale);
  }
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

export interface DrawOpts extends Rings {
  frame?: number;
  /** 좌우 반전 — 물고기는 왼쪽을 보는 것이 기본 */
  flip?: boolean;
  /** 초 단위 시각 — 주어지면 꼬리 쪽 열이 흔들린다(열 흔들기) */
  t?: number;
}

// 유영 흔들기 — 완만한 전신 상하 부유(bob)에 머리(왼쪽)에서 꼬리(오른쪽)로 흐르는 긴 파장의
// S자 진행파(ωt - kx)를 2차 곡선 진폭(u²)으로 더한다. 허리 경첩 없이 몸 전체가 이어져 헤엄친다.
const SWIM_HZ = 1.1;
const BOB_AMP = 0.35;
const WAVE_AMP = 0.75;
const WAVE_RAD = Math.PI * 1.15;

export function wobbleOffsets(sprite: PixelSprite, t: number, scale: number, frame = 0): number[] {
  const rows = sprite.frames[frame] ?? sprite.frames[0];
  const b = opaqueBounds(rows);
  const out = new Array<number>(sprite.w).fill(0);
  if (!b) return out;
  const span = Math.max(1, b.maxX - b.minX);
  const omega = t * Math.PI * 2 * SWIM_HZ;
  const bob = Math.sin(omega * 0.5) * BOB_AMP;
  for (let x = b.minX; x <= b.maxX; x++) {
    const u = (x - b.minX) / span;
    const wave = Math.sin(omega - u * WAVE_RAD) * (u * u) * WAVE_AMP;
    const raw = Math.round((bob + wave) * scale);
    out[x] = Math.max(-scale, Math.min(scale, raw));
  }
  return out;
}

/** 좌상단 (x, y)에 찍는다 */
export function drawSprite(
  ctx: Ctx, sprite: PixelSprite, colors: readonly string[], scale: number,
  x: number, y: number, opts: DrawOpts = {},
): void {
  const img = rasterize(sprite, colors, scale, opts.frame ?? 0, { outline: opts.outline, aura: opts.aura });
  if (!img) return;
  const px = Math.round(x), py = Math.round(y);
  ctx.save();
  if (opts.flip) {
    ctx.translate(px + img.width, py);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(px, py);
  }
  if (opts.t === undefined) {
    ctx.drawImage(img, 0, 0);
  } else {
    const off = wobbleOffsets(sprite, opts.t, scale, opts.frame ?? 0);
    for (let col = 0; col < sprite.w; col++) {
      ctx.drawImage(img, col * scale, 0, scale, img.height, col * scale, off[col], scale, img.height);
    }
  }
  ctx.restore();
}

/** 격자 중심을 (cx, cy)에 맞춰 찍는다 — 프리셋 캔버스 가운데 배치용 */
export function drawSpriteCentered(
  ctx: Ctx, sprite: PixelSprite, colors: readonly string[], scale: number,
  cx: number, cy: number, opts: DrawOpts = {},
): void {
  drawSprite(ctx, sprite, colors, scale, cx - (sprite.w * scale) / 2, cy - (sprite.h * scale) / 2, opts);
}
