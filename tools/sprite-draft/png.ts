// 최소 PNG 인코더 — RGBA 버퍼를 비압축 필터 0 + deflate로 쓴다. 시안 확인용 시트 출력에만 쓴다.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export class Bitmap {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number) { this.data = new Uint8Array(w * h * 4); }

  fill(x: number, y: number, w: number, h: number, css: string): void {
    const [r, g, b, a] = parseCss(css);
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) {
        const i = (yy * this.w + xx) * 4;
        if (a >= 1) { this.data.set([r, g, b, 255], i); continue; }
        // 단순 알파 합성 — 시안에서는 흰색 알파 하이라이트 정도만 들어온다
        const d = this.data;
        d[i] = Math.round(d[i] * (1 - a) + r * a);
        d[i + 1] = Math.round(d[i + 1] * (1 - a) + g * a);
        d[i + 2] = Math.round(d[i + 2] * (1 - a) + b * a);
        d[i + 3] = 255;
      }
    }
  }

  png(): Buffer {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 4 + 1)] = 0;
      raw.set(this.data.subarray(y * this.w * 4, (y + 1) * this.w * 4), y * (this.w * 4 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array()),
    ]);
  }
}

function parseCss(css: string): [number, number, number, number] {
  if (css.startsWith('#')) {
    const h = css.length === 4 ? css.slice(1).split('').map(c => c + c).join('') : css.slice(1);
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(css);
  if (!m) throw new Error(`unsupported color: ${css}`);
  const p = m[1].split(',').map(s => Number(s.trim()));
  return [p[0], p[1], p[2], p[3] ?? 1];
}
