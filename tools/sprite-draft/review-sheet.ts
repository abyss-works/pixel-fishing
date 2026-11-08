// 검수 시트 CLI — 기준 원화 몇 종과 신규 원화(일반·변이)를 같은 배율로 나란히 놓은 PNG를 만든다.
// 사용: npx tsx tools/sprite-draft/review-sheet.ts <out.png> [png 폴더]
// 칸마다 어종 id를 아래에 적는다. 렌더 규칙은 제품과 같다(어두운 남색 1칸 외곽선, 물색 배경).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bitmap } from './png';
import { CANDIDATE_IDS, gridFromPng } from './styleMetrics';

/** 화풍 비교용 기준 원화. 소형어·상어·다랑어·관상어·날치 등 생물군을 고르게 둔다. */
const REFERENCE = ['carp', 'clownfish', 'blueshark', 'butterflyfish', 'goldfish', 'skipjack', 'hammerhead', 'flyingfish'];
const COLS = 9, SCALE = 6, PAD = 1, LABEL_H = 14;
const BG = '#2a3f63', OUTLINE = '#182540', TEXT = '#e8eef7';

// 3×5 글꼴: 문자마다 15비트(행 우선, 위 왼쪽이 최상위)
const FONT: Record<string, string> = {
  a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110', e: '111100110100111',
  f: '111100110100100', g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010',
  k: '101101110101101', l: '100100100100111', m: '101111111101101', n: '110101101101101', o: '010101101101010',
  p: '110101110100100', q: '010101101111011', r: '110101110101101', s: '011100010001110', t: '111010010010010',
  u: '101101101101111', v: '101101101101010', w: '101101111111101', x: '101101010101101', y: '101101010010010',
  z: '111001010100111', '-': '000000111000000', '.': '000000000000010',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
};

function text(bmp: Bitmap, s: string, x: number, y: number): void {
  let cx = x;
  for (const ch of s) {
    const bits = FONT[ch];
    if (bits) for (let i = 0; i < 15; i++) if (bits[i] === '1') bmp.fill(cx + (i % 3) * 2, y + Math.floor(i / 3) * 2, 2, 2, TEXT);
    cx += 8;
  }
}

const [, , outArg, dirArg] = process.argv;
if (!outArg) { console.error('usage: review-sheet.ts <out.png> [png dir]'); process.exit(1); }
const dir = resolve(dirArg ?? join(dirname(fileURLToPath(import.meta.url)), 'png/fish'));

const chunk = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));
const rows: { label: string; keys: (string | null)[] }[] = [];
const variantOf = (id: string) => (existsSync(join(dir, `${id}.variant.png`)) ? `${id}.variant` : null);
for (const group of [REFERENCE, ...chunk(CANDIDATE_IDS, COLS)]) {
  rows.push({ label: 'n', keys: group });
  rows.push({ label: 'v', keys: group.map(variantOf) });
}

const cw = (32 + PAD * 2) * SCALE, ch = (16 + PAD * 2) * SCALE + LABEL_H;
const bmp = new Bitmap(COLS * cw, rows.length * ch);
bmp.fill(0, 0, bmp.w, bmp.h, BG);
rows.forEach((row, ri) => row.keys.forEach((key, ci) => {
  if (!key) return;
  const grid = gridFromPng(readFileSync(join(dir, `${key}.png`)));
  const ox = ci * cw + PAD * SCALE, oy = ri * ch + PAD * SCALE;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < grid.w && y < grid.h && grid.cells[y][x] !== null;
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
    const c = grid.cells[y][x];
    if (c) bmp.fill(ox + x * SCALE, oy + y * SCALE, SCALE, SCALE, c);
    else if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) bmp.fill(ox + x * SCALE, oy + y * SCALE, SCALE, SCALE, OUTLINE);
  }
  if (row.label === 'n') text(bmp, key, ci * cw + 4, ri * ch + (16 + PAD * 2) * SCALE + 1);
}));
writeFileSync(resolve(outArg), bmp.png());
console.log(`${rows.length} 행 → ${resolve(outArg)}`);
