import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkRows } from './sprite-draft/commonRules';
import { decodePng } from './sprite-draft/pngDecode';
import {
  FAVICON_PALETTE, FAVICON_ROWS,
  buildAppleTouchIconPng, buildFaviconIco, buildFaviconSvg,
} from './generate-favicon';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicFile = (name: string) => readFileSync(resolve(rootDir, 'public', name));

describe('파비콘 생성기', () => {
  it('16x16 격자와 4색 팔레트가 101픽셀·공통 규칙 위반 0건이다', () => {
    expect(FAVICON_ROWS).toHaveLength(16);
    for (const row of FAVICON_ROWS) expect(row).toHaveLength(16);
    expect(FAVICON_PALETTE).toEqual(['#0b1322', '#f57c00', '#ffca28', '#ffffff']);
    const px = FAVICON_ROWS.reduce((sum, r) => sum + [...r].filter(ch => ch !== '.').length, 0);
    expect(px).toBe(101);
    expect(checkRows(FAVICON_ROWS, 0)).toEqual([]);
  });

  it('SVG는 16x16 투명 배경 crispEdges rect로 생성되고 타일 배경이 없다', () => {
    const svg = buildFaviconSvg();
    expect(svg).toContain('viewBox="0 0 16 16"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).not.toContain('viewBox="0 0 24 24"');
    expect(svg).not.toContain('#ffd700');
    const rects = [...svg.matchAll(/<rect x="\d+" y="\d+" width="(\d+)" height="(\d+)"/g)];
    const area = rects.reduce((sum, m) => sum + Number(m[1]) * Number(m[2]), 0);
    expect(area).toBe(101);
  });

  it('ICO는 16x16과 32x32 멀티사이즈 투명 배경 32비트 아이콘을 담는다', () => {
    const ico = buildFaviconIco();
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);

    const sizes = [0, 1].map(i => ({
      w: ico.readUInt8(6 + i * 16),
      h: ico.readUInt8(6 + i * 16 + 1),
      bpp: ico.readUInt16LE(6 + i * 16 + 6),
      size: ico.readUInt32LE(6 + i * 16 + 8),
      offset: ico.readUInt32LE(6 + i * 16 + 12),
    }));
    expect(sizes.map(s => [s.w, s.h, s.bpp])).toEqual([[16, 16, 32], [32, 32, 32]]);

    // 16x16 모서리 (0,0)은 투명(alpha 0)이고 물고기 내부 픽셀은 불투명(alpha 255)
    const off16 = sizes[0].offset;
    expect(ico.readUInt32LE(off16)).toBe(40);
    const xor16 = off16 + 40;
    const bottomLeftAlpha = ico[xor16 + 3]; // bottom-up row 0 = y=15, x=0 (투명)
    expect(bottomLeftAlpha).toBe(0);
    const fishPixelOffset = xor16 + ((15 - 7) * 16 + 3) * 4; // y=7, x=3 (#ffffff 눈/하이라이트)
    expect([ico[fishPixelOffset + 2], ico[fishPixelOffset + 1], ico[fishPixelOffset], ico[fishPixelOffset + 3]]).toEqual([255, 255, 255, 255]);
  });

  it('Apple Touch Icon은 180x180 불투명 네이비 배경 위에 nearest-neighbor로 픽셀 경계를 유지한다', () => {
    const png = buildAppleTouchIconPng();
    const { w, h, px } = decodePng(png);
    expect([w, h]).toEqual([180, 180]);

    const allowed = new Set(FAVICON_PALETTE);
    const seen = new Set<string>();
    for (let i = 0; i < px.length; i += 4) {
      expect(px[i + 3]).toBe(255);
      const hex = `#${px[i].toString(16).padStart(2, '0')}${px[i + 1].toString(16).padStart(2, '0')}${px[i + 2].toString(16).padStart(2, '0')}`;
      expect(allowed.has(hex)).toBe(true);
      seen.add(hex);
    }
    expect(seen.size).toBe(4);
    // 모서리 (0, 0)은 어두운 배경(#0b1322)
    expect([px[0], px[1], px[2]]).toEqual([0x0b, 0x13, 0x22]);
  });

  it('public/favicon.* 파일이 생성기 출력과 일치한다', () => {
    expect(publicFile('favicon.svg').toString('utf8')).toBe(buildFaviconSvg());
    expect(publicFile('favicon.ico').equals(buildFaviconIco())).toBe(true);
    expect(publicFile('apple-touch-icon.png').equals(buildAppleTouchIconPng())).toBe(true);
  });
});
