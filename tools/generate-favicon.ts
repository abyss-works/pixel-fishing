// 파비콘 생성기: 16x16 금붕어 실루엣 원화 격자에서 SVG, 멀티사이즈 ICO(16x16, 32x32), Apple Touch Icon(180x180 PNG)을 생성한다.
// 사용: pnpm exec tsx tools/generate-favicon.ts
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Bitmap } from './sprite-draft/png';

export const FAVICON_PALETTE = ['#0b1322', '#f57c00', '#ffca28', '#ffffff'] as const;

export const FAVICON_ROWS = [
  '................',
  '................',
  '......0000......',
  '.....022210.....',
  '...000222100.00.',
  '..0222222110010.',
  '.02202222110210.',
  '.02322221112210.',
  '.01112211110110.',
  '..0011111100000.',
  '....001100......',
  '.....0100.......',
  '......00........',
  '................',
  '................',
  '................',
] as const;

const GRID_SIZE = 16;
const APPLE_ICON_SIZE = 180;
const APPLE_ICON_BG = '#0b1322';
const APPLE_ICON_SCALE = 10;

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 16x16 투명 배경 SVG(<rect> RLE, crispEdges) 생성 */
export function buildFaviconSvg(): string {
  const lines = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">'];
  for (let y = 0; y < GRID_SIZE; y++) {
    let x = 0;
    while (x < GRID_SIZE) {
      const ch = FAVICON_ROWS[y][x];
      if (ch === '.') {
        x++;
        continue;
      }
      let xEnd = x + 1;
      while (xEnd < GRID_SIZE && FAVICON_ROWS[y][xEnd] === ch) xEnd++;
      const fill = FAVICON_PALETTE[Number(ch)];
      lines.push(`  <rect x="${x}" y="${y}" width="${xEnd - x}" height="1" fill="${fill}"/>`);
      x = xEnd;
    }
  }
  lines.push('</svg>');
  return `${lines.join('\n')}\n`;
}

function encodeIcoDib(scale: number): Buffer {
  const size = GRID_SIZE * scale;
  const headerSize = 40;
  const xorSize = size * size * 4;
  const andStride = Math.ceil(size / 32) * 4;
  const andSize = andStride * size;
  const buf = Buffer.alloc(headerSize + xorSize + andSize);

  buf.writeUInt32LE(headerSize, 0);
  buf.writeInt32LE(size, 4);
  buf.writeInt32LE(size * 2, 8);
  buf.writeUInt16LE(1, 12);
  buf.writeUInt16LE(32, 14);
  buf.writeUInt32LE(0, 16);
  buf.writeUInt32LE(xorSize, 20);

  const rgbPalette = FAVICON_PALETTE.map(hexRgb);
  const andOffset = headerSize + xorSize;

  for (let y = 0; y < size; y++) {
    const srcY = Math.floor(y / scale);
    const dstRow = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const srcX = Math.floor(x / scale);
      const ch = FAVICON_ROWS[srcY][srcX];
      const pixelOffset = headerSize + (dstRow * size + x) * 4;
      if (ch === '.') {
        const byteIdx = andOffset + dstRow * andStride + (x >> 3);
        buf[byteIdx] |= 0x80 >> (x & 7);
      } else {
        const [r, g, b] = rgbPalette[Number(ch)];
        buf[pixelOffset] = b;
        buf[pixelOffset + 1] = g;
        buf[pixelOffset + 2] = r;
        buf[pixelOffset + 3] = 255;
      }
    }
  }
  return buf;
}

/** 16x16·32x32 멀티사이즈 투명 배경 ICO 생성 */
export function buildFaviconIco(): Buffer {
  const entries = [
    { size: 16, data: encodeIcoDib(1) },
    { size: 32, data: encodeIcoDib(2) },
  ];
  const dirHeader = Buffer.alloc(6);
  dirHeader.writeUInt16LE(0, 0);
  dirHeader.writeUInt16LE(1, 2);
  dirHeader.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dirEntries = entries.map(entry => {
    const rec = Buffer.alloc(16);
    rec.writeUInt8(entry.size, 0);
    rec.writeUInt8(entry.size, 1);
    rec.writeUInt8(0, 2);
    rec.writeUInt8(0, 3);
    rec.writeUInt16LE(1, 4);
    rec.writeUInt16LE(32, 6);
    rec.writeUInt32LE(entry.data.length, 8);
    rec.writeUInt32LE(offset, 12);
    offset += entry.data.length;
    return rec;
  });

  return Buffer.concat([dirHeader, ...dirEntries, ...entries.map(e => e.data)]);
}

/** 180x180 Apple Touch Icon PNG(어두운 네이비 배경 + 정수 nearest-neighbor 배율) 생성 */
export function buildAppleTouchIconPng(): Buffer {
  let minX = GRID_SIZE, maxX = -1, minY = GRID_SIZE, maxY = -1;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (FAVICON_ROWS[y][x] === '.') continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  const fishW = (maxX - minX + 1) * APPLE_ICON_SCALE;
  const fishH = (maxY - minY + 1) * APPLE_ICON_SCALE;
  const originX = Math.floor((APPLE_ICON_SIZE - fishW) / 2);
  const originY = Math.floor((APPLE_ICON_SIZE - fishH) / 2);

  const bm = new Bitmap(APPLE_ICON_SIZE, APPLE_ICON_SIZE);
  bm.fill(0, 0, APPLE_ICON_SIZE, APPLE_ICON_SIZE, APPLE_ICON_BG);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const ch = FAVICON_ROWS[y][x];
      if (ch === '.') continue;
      const color = FAVICON_PALETTE[Number(ch)];
      bm.fill(
        originX + (x - minX) * APPLE_ICON_SCALE,
        originY + (y - minY) * APPLE_ICON_SCALE,
        APPLE_ICON_SCALE,
        APPLE_ICON_SCALE,
        color,
      );
    }
  }
  return bm.png();
}

export function writeFavicons(publicDir: string): void {
  writeFileSync(resolve(publicDir, 'favicon.svg'), buildFaviconSvg(), 'utf8');
  writeFileSync(resolve(publicDir, 'favicon.ico'), buildFaviconIco());
  writeFileSync(resolve(publicDir, 'apple-touch-icon.png'), buildAppleTouchIconPng());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
  writeFavicons(publicDir);
  console.log(`Generated favicons in ${publicDir}`);
}
