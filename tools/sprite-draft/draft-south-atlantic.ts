// 남대서양 신규 어종 초안 생성 CLI — 어종마다 몸통 윤곽·지느러미·무늬 매개변수로 32×16 원화 PNG를 만든다.
// 사용: npx tsx tools/sprite-draft/draft-south-atlantic.ts [출력 폴더]
// 기본 출력은 tools/sprite-draft/png/fish. 이어서 import-png.ts 로 원화 격자를 다시 만든다.
// 초안 전용이다. 확정 원화는 PNG를 직접 다듬어 이 폴더에 덮어쓴다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bitmap } from './png';

type Role = '.' | 'd' | 'b' | 'l' | 'k' | 'a' | 'y' | 'e' | 'w';
type Cells = Role[][];

const W = 32, H = 16;
const X_MIN = 2, X_MAX = 29, Y_MIN = 2, Y_MAX = 13;

interface Tail { kind: 'fork' | 'lunate' | 'square' | 'round' | 'shark'; len: number; spread: number; role?: Role }
interface Fin { t0: number; t1: number; h: number; kind?: 'flat' | 'tri' | 'sail' | 'rear'; role?: Role }
interface PaintCtx { x: number; y: number; t: number; u: number; rx: number }
interface Spec {
  id: string;
  base: string; variant: string;
  accent?: { a?: string; y?: string };
  whiteBelly?: boolean;
  x0: number; x1: number; yc: number; top: number; bot: number;
  snout?: number; head?: number; ped?: number; tf?: number;
  tail: Tail;
  dorsal?: Fin[]; ventral?: Fin[];
  eye: { t: number; dy: number; size?: 1 | 2 | 3 };
  gill?: number[]; mouth?: number;
  pect?: { len: number; dy: number; role?: Role };
  paint?: (c: PaintCtx) => Role | undefined;
  extra?: (set: (x: number, y: number, r: Role) => void, s: { x0: number; yc: number; x1: number }) => void;
}

const blank = (): Cells => Array.from({ length: H }, () => Array<Role>(W).fill('.'));

function paintFish(s: Spec): Cells {
  const g = blank();
  const len = s.x1 - s.x0;
  const head = s.head ?? 0.3, sn = s.snout ?? 0.3, ped = s.ped ?? 0.3, tf = s.tf ?? 0.62;
  const colTop: Record<number, number> = {}, colBot: Record<number, number> = {};
  const set = (x: number, y: number, r: Role) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = r; };
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && g[y][x] !== '.';

  for (let x = s.x0; x <= s.x1; x++) {
    const t = (x - s.x0) / len;
    let env: number;
    if (t < head) env = sn + (1 - sn) * Math.sqrt(t / head);
    else if (t <= tf) env = 1;
    else env = 1 - (1 - ped) * Math.pow((t - tf) / (1 - tf), 0.9);
    const te = Math.max(0, Math.round(s.top * env)), be = Math.max(0, Math.round(s.bot * env));
    colTop[x] = s.yc - te; colBot[x] = s.yc + be;
    for (let y = s.yc - te; y <= s.yc + be; y++) {
      const u = te + be === 0 ? 0.5 : (y - (s.yc - te)) / (te + be);
      let r: Role = 'b';
      if (y === s.yc - te || (te >= 3 && y === s.yc - te + 1 && t > 0.15)) r = 'd';
      if (te + be > 0 && (y === s.yc + be || (be >= 3 && y === s.yc + be - 1))) r = s.whiteBelly ? 'w' : 'l';
      const o = s.paint?.({ x, y, t, u, rx: x - s.x0 });
      set(x, y, o ?? r);
    }
  }

  const fin = (f: Fin, dir: -1 | 1) => {
    const xs = Math.round(s.x0 + f.t0 * len), xe = Math.round(s.x0 + f.t1 * len);
    const n = xe - xs;
    for (let x = xs; x <= xe; x++) {
      const i = x - xs;
      let hh = f.h;
      if (f.kind === 'tri') hh = Math.round(f.h * (1 - i / (n + 1)));
      else if (f.kind === 'sail') hh = Math.round(f.h * Math.sin(Math.PI * (i + 0.5) / (n + 1)));
      else if (f.kind === 'rear') hh = Math.round(f.h * (i + 1) / (n + 1));
      hh = Math.max(1, hh);
      for (let k = 1; k <= hh; k++) set(x, dir < 0 ? colTop[x] - k : colBot[x] + k, f.role ?? 'd');
    }
  };
  s.dorsal?.forEach(f => fin(f, -1));
  s.ventral?.forEach(f => fin(f, 1));

  // 꼬리
  const T = s.tail, tr = T.role ?? 'd';
  const peT = s.yc - colTop[s.x1], peB = colBot[s.x1] - s.yc;
  for (let i = 0; i < T.len; i++) {
    const x = s.x1 + 1 + i;
    let up = peT, dn = peB, notch = 0;
    const f = (i + 1) / T.len;
    if (T.kind === 'fork' || T.kind === 'lunate') {
      up = Math.max(peT, Math.round(T.spread * f)); dn = Math.max(peB, Math.round(T.spread * f));
      notch = Math.min(T.kind === 'lunate' ? i : Math.floor(i * 0.6), Math.min(up, dn) - 1);
    } else if (T.kind === 'square') {
      up = peT + Math.round(T.spread * f); dn = peB + Math.round(T.spread * f);
    } else if (T.kind === 'round') {
      const e = Math.round(T.spread * Math.sin(Math.PI * (i + 0.9) / (T.len + 0.8)));
      up = Math.max(1, e); dn = Math.max(1, e);
    } else {
      up = peT + Math.round(T.spread * f);
      dn = i < T.len - 1 ? peB + Math.round(0.45 * T.spread * f) : 0;
      if (i >= 2) notch = Math.max(0, up - 3 - (i >= T.len - 1 ? 0 : 0));
    }
    for (let dy = -up; dy <= dn; dy++) {
      if (notch > 0 && T.kind !== 'shark' && Math.abs(dy) < notch) continue;
      if (T.kind === 'shark' && notch > 0 && dy > -up + 2 && dy < -1 && i >= 2) continue;
      set(x, s.yc + dy, tr);
    }
  }

  // 머리 부위
  const ex = Math.round(s.x0 + s.eye.t * len), ey = s.yc - s.eye.dy;
  const sz = s.eye.size ?? 1;
  for (let a = 0; a < sz; a++) for (let b = 0; b < sz; b++) if (opaque(ex + a, ey + b)) set(ex + a, ey + b, a === 0 && b === 0 && sz > 1 ? 'w' : 'e');
  if (sz === 1 && opaque(ex, ey)) set(ex, ey, 'e');
  for (const gt of s.gill ?? []) {
    const gx = Math.round(s.x0 + gt * len);
    for (let y = colTop[gx] + 1; y <= colBot[gx] - 1; y++) if (opaque(gx, y) && !(gx >= ex && gx < ex + sz && y >= ey && y < ey + sz)) set(gx, y, 'k');
  }
  if (s.mouth !== undefined) {
    const my = s.yc + s.mouth;
    for (let x = s.x0; x <= s.x0 + 1; x++) if (opaque(x, my)) set(x, my, 'k');
  }
  if (s.pect) {
    const gx = Math.round(s.x0 + (s.gill?.[s.gill.length - 1] ?? 0.3) * len) + 1;
    for (let i = 0; i < s.pect.len; i++) if (opaque(gx + i, s.yc + s.pect.dy)) set(gx + i, s.yc + s.pect.dy, s.pect.role ?? 'd');
  }
  s.extra?.(set, { x0: s.x0, yc: s.yc, x1: s.x1 });
  return g;
}

// ── 색 ──
const hexToRgb = (h: string): [number, number, number] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = (c: number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const scale = (c: number[], f: number) => c.map(v => v * f);
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

function colors(base: string, s: Spec): Record<Exclude<Role, '.'>, string> {
  let c = hexToRgb(base);
  const L = lum(c);
  if (L < 0.14) c = scale(c, Math.min(3.4, 0.14 / Math.max(L, 0.04)));
  return {
    d: toHex([c[0] * 0.62, c[1] * 0.68, c[2] * 0.78]),
    b: toHex(c),
    l: toHex(s.whiteBelly ? mix(c, [248, 252, 255], 0.75) : scale(c, 1.38)),
    k: toHex(scale(c, 0.42)),
    a: s.accent?.a ?? toHex(scale(c, 1.65)),
    y: s.accent?.y ?? '#e0b23e',
    e: '#0b1322',
    w: '#f8fcff',
  };
}

// ── 어종 명세 ──
const SPECS: Spec[] = [
  { id: 'capeanchovy', base: '#a9b7c2', variant: '#4b5a66',
    x0: 4, x1: 19, yc: 7, top: 2, bot: 2, snout: 0.45, head: 0.28, ped: 0.22,
    tail: { kind: 'fork', len: 4, spread: 3 },
    dorsal: [{ t0: 0.45, t1: 0.58, h: 1 }],
    eye: { t: 0.1, dy: 1 }, gill: [0.22], mouth: 1,
    paint: c => (c.y === 7 && c.t > 0.2 ? 'w' : undefined) },
  { id: 'capejack', base: '#7d93a5', variant: '#e0b23e',
    x0: 3, x1: 20, yc: 7, top: 3, bot: 3, snout: 0.35, head: 0.3, ped: 0.2,
    tail: { kind: 'fork', len: 5, spread: 4 },
    dorsal: [{ t0: 0.25, t1: 0.38, h: 2, kind: 'sail' }, { t0: 0.55, t1: 0.78, h: 1 }],
    ventral: [{ t0: 0.55, t1: 0.78, h: 1 }],
    eye: { t: 0.1, dy: 1, size: 2 }, gill: [0.26],
    paint: c => (c.y === 7 && c.t > 0.62 && c.rx % 2 === 0 ? 'k' : undefined) },
  { id: 'capehake', base: '#8fa1ae', variant: '#e3eaef',
    x0: 2, x1: 21, yc: 7, top: 3, bot: 2, snout: 0.45, head: 0.3, ped: 0.3,
    tail: { kind: 'square', len: 3, spread: 1 },
    dorsal: [{ t0: 0.28, t1: 0.4, h: 2, kind: 'tri' }, { t0: 0.5, t1: 0.82, h: 1 }],
    ventral: [{ t0: 0.5, t1: 0.82, h: 1 }],
    eye: { t: 0.1, dy: 1, size: 2 }, gill: [0.27], mouth: 1,
    pect: { len: 2, dy: 1 } },
  { id: 'snoek', base: '#5f7f94', variant: '#d3dde3',
    x0: 2, x1: 22, yc: 8, top: 2, bot: 2, snout: 0.5, head: 0.28, ped: 0.22,
    tail: { kind: 'fork', len: 4, spread: 3 },
    dorsal: [{ t0: 0.4, t1: 0.5, h: 1 }, { t0: 0.78, t1: 0.9, h: 1, role: 'a' }],
    ventral: [{ t0: 0.78, t1: 0.9, h: 1, role: 'a' }],
    eye: { t: 0.08, dy: 1 }, gill: [0.26],
    extra: (set, s) => { 'kwkwk'.split('').forEach((r, i) => set(s.x0 + i, s.yc + 1, r as Role)); } },
  { id: 'kingfish', base: '#5f8fa6', variant: '#cfd8dc',
    whiteBelly: true,
    x0: 3, x1: 21, yc: 7, top: 3, bot: 3, snout: 0.35, head: 0.3, ped: 0.18,
    tail: { kind: 'fork', len: 5, spread: 4, role: 'y' },
    dorsal: [{ t0: 0.3, t1: 0.45, h: 2, kind: 'sail' }, { t0: 0.6, t1: 0.8, h: 1 }],
    ventral: [{ t0: 0.6, t1: 0.8, h: 1 }],
    eye: { t: 0.1, dy: 1, size: 2 }, gill: [0.27],
    paint: c => (c.y === 7 && c.t > 0.2 ? 'y' : undefined) },
  { id: 'toothfish', base: '#3e4f5c', variant: '#25343f',
    x0: 2, x1: 22, yc: 8, top: 4, bot: 3, snout: 0.5, head: 0.38, ped: 0.3, tf: 0.7,
    tail: { kind: 'round', len: 4, spread: 3 },
    dorsal: [{ t0: 0.3, t1: 0.45, h: 2 }, { t0: 0.5, t1: 0.75, h: 1 }],
    ventral: [{ t0: 0.55, t1: 0.75, h: 1 }],
    eye: { t: 0.1, dy: 2, size: 2 }, gill: [0.36], mouth: 1, pect: { len: 4, dy: 1 },
    extra: (set, s) => {
      for (const [dx, dy] of [[11, -1], [12, -1], [15, 0], [16, 0], [13, 2], [14, 2], [19, -1]]) set(s.x0 + dx, s.yc + dy, 'k');
      set(s.x0 + 1, s.yc + 2, 'w'); set(s.x0 + 3, s.yc + 2, 'w');
    } },
  { id: 'sthwrasse', base: '#d98f4e', variant: '#f1ece4',
    x0: 4, x1: 20, yc: 7, top: 3, bot: 2, snout: 0.4, head: 0.3, ped: 0.3,
    tail: { kind: 'round', len: 3, spread: 3 },
    dorsal: [{ t0: 0.2, t1: 0.85, h: 1 }],
    ventral: [{ t0: 0.55, t1: 0.8, h: 1 }],
    eye: { t: 0.1, dy: 1 }, gill: [0.28],
    paint: c => (c.y === 7 && c.t > 0.3 ? 'k' : (c.rx === 8 || c.rx === 12) && c.u < 0.4 ? 'k' : undefined) },
  { id: 'sthpuffer', base: '#b79b6b', variant: '#e6c14a',
    x0: 7, x1: 18, yc: 8, top: 4, bot: 4, snout: 0.55, head: 0.4, ped: 0.5, tf: 0.8,
    tail: { kind: 'round', len: 3, spread: 2 },
    dorsal: [{ t0: 0.6, t1: 0.72, h: 1 }],
    ventral: [{ t0: 0.62, t1: 0.74, h: 1 }],
    eye: { t: 0.18, dy: 1, size: 2 }, mouth: 1, gill: [0.4], pect: { len: 2, dy: 1 },
    extra: (set, s) => { for (const [dx, dy] of [[4, -2], [7, -2], [6, -3], [9, -1], [8, 1]]) set(s.x0 + dx, s.yc + dy, 'k'); } },
  { id: 'apollodamsel', base: '#4f86b8', variant: '#243b55',
    x0: 6, x1: 19, yc: 7, top: 3, bot: 3, snout: 0.5, head: 0.35, ped: 0.22,
    tail: { kind: 'fork', len: 4, spread: 3 },
    dorsal: [{ t0: 0.2, t1: 0.85, h: 1 }],
    ventral: [{ t0: 0.55, t1: 0.8, h: 1 }],
    eye: { t: 0.12, dy: 1, size: 2 }, gill: [0.3] },
  { id: 'ascensionangel', base: '#e8c04a', variant: '#f2efe6',
    accent: { a: '#4fa3d9' },
    x0: 7, x1: 17, yc: 8, top: 3, bot: 3, snout: 0.6, head: 0.45, ped: 0.55, tf: 0.72,
    tail: { kind: 'square', len: 3, spread: 1, role: 'a' },
    dorsal: [{ t0: 0.3, t1: 1.0, h: 3, kind: 'rear', role: 'a' }],
    ventral: [{ t0: 0.4, t1: 1.0, h: 2, kind: 'rear', role: 'a' }],
    eye: { t: 0.15, dy: 1, size: 2 }, gill: [0.35],
    paint: c => (c.rx === 3 ? 'k' : undefined) },
  { id: 'wahoo', base: '#3f7fa0', variant: '#c8d4dc',
    whiteBelly: true,
    x0: 2, x1: 23, yc: 7, top: 3, bot: 2, snout: 0.55, head: 0.3, ped: 0.2,
    tail: { kind: 'fork', len: 4, spread: 3 },
    dorsal: [{ t0: 0.25, t1: 0.82, h: 1 }, { t0: 0.86, t1: 0.96, h: 1, role: 'a' }],
    ventral: [{ t0: 0.86, t1: 0.96, h: 1, role: 'a' }],
    eye: { t: 0.08, dy: 1 }, gill: [0.26],
    paint: c => (c.t > 0.3 && c.rx % 4 === 2 && c.u < 0.75 ? 'k' : undefined),
    extra: (set, s) => { 'kwkw'.split('').forEach((r, i) => set(s.x0 + i, s.yc + 1, r as Role)); } },
  { id: 'galapagosshark', base: '#6c7e8a', variant: '#aab8c2',
    whiteBelly: true,
    x0: 2, x1: 21, yc: 8, top: 3, bot: 3, snout: 0.4, head: 0.35, ped: 0.2, tf: 0.65,
    tail: { kind: 'shark', len: 5, spread: 5 },
    dorsal: [{ t0: 0.38, t1: 0.55, h: 3, kind: 'tri' }, { t0: 0.74, t1: 0.8, h: 1 }],
    ventral: [{ t0: 0.3, t1: 0.45, h: 2, kind: 'tri' }],
    eye: { t: 0.1, dy: 1 }, gill: [0.25, 0.29, 0.33], mouth: 2 },
  { id: 'nighthake', base: '#4d5f73', variant: '#27333f',
    x0: 3, x1: 20, yc: 8, top: 3, bot: 2, snout: 0.5, head: 0.32, ped: 0.25,
    tail: { kind: 'lunate', len: 4, spread: 3 },
    dorsal: [{ t0: 0.3, t1: 0.42, h: 2, kind: 'sail' }, { t0: 0.55, t1: 0.8, h: 1 }],
    ventral: [{ t0: 0.55, t1: 0.8, h: 1 }],
    eye: { t: 0.1, dy: 2, size: 3 }, gill: [0.3], mouth: 1 },
  { id: 'darktoothfish', base: '#1b2631', variant: '#0b1118',
    x0: 2, x1: 21, yc: 7, top: 3, bot: 3, snout: 0.6, head: 0.42, ped: 0.25, tf: 0.66,
    tail: { kind: 'square', len: 4, spread: 2 },
    dorsal: [{ t0: 0.35, t1: 0.55, h: 2 }, { t0: 0.6, t1: 0.8, h: 1 }],
    ventral: [{ t0: 0.6, t1: 0.8, h: 1 }],
    eye: { t: 0.1, dy: 1, size: 3 }, gill: [0.4], mouth: 2, pect: { len: 3, dy: 1 },
    extra: (set, s) => {
      for (const [dx, dy] of [[12, -1], [13, -1], [16, 1], [17, 1], [14, 2]]) set(s.x0 + dx, s.yc + dy, 'k');
      set(s.x0 + 1, s.yc + 3, 'w'); set(s.x0 + 3, s.yc + 3, 'w'); set(s.x0 + 5, s.yc + 3, 'w');
    } },
  { id: 'eolgedom', base: '#b0584d', variant: '#4a2623',
    x0: 3, x1: 20, yc: 8, top: 3, bot: 3, snout: 0.4, head: 0.35, ped: 0.3,
    tail: { kind: 'round', len: 4, spread: 3 },
    dorsal: [{ t0: 0.2, t1: 0.35, h: 2, kind: 'tri' }, { t0: 0.38, t1: 0.7, h: 1 }],
    ventral: [{ t0: 0.5, t1: 0.7, h: 1 }],
    eye: { t: 0.1, dy: 1, size: 2 }, gill: [0.3], mouth: 2,
    extra: (set, s) => { for (const [dx, dy] of [[9, -1], [12, 0], [15, -1]]) set(s.x0 + dx, s.yc + dy, 'l'); } },
  { id: 'bigeye', base: '#c24a3c', variant: '#6d2a24',
    x0: 5, x1: 19, yc: 8, top: 3, bot: 3, snout: 0.6, head: 0.4, ped: 0.35, tf: 0.75,
    tail: { kind: 'round', len: 4, spread: 3 },
    dorsal: [{ t0: 0.3, t1: 0.55, h: 2, kind: 'tri' }, { t0: 0.6, t1: 0.8, h: 1 }],
    ventral: [{ t0: 0.35, t1: 0.5, h: 2, kind: 'tri' }, { t0: 0.6, t1: 0.8, h: 1 }],
    eye: { t: 0.12, dy: 1, size: 3 }, gill: [0.42], mouth: 0 },
];

// 네임드 아다마스토르 — 곶처럼 솟은 머리, 벌어진 입, 늘어진 돌기. 28열×12행(x 2~29, y 2~13)
const ADAMASTOR = [
  '.kkkkkkkkddd',
  '.k.......dddddd',
  '.k......dddddddddd',
  '.k.....ddbbbbbbbbbbdd',
  '.a....ddbbwebbbbbbbbbbddd',
  '.a..ddbbbbbbbbbbbbbbbbbbbddd',
  '...d' + 'wkwkwkk' + 'b'.repeat(14) + 'ddd',
  '...' + 'kkkkkkkk' + 'b'.repeat(14) + 'ddd',
  '...d' + 'kwkwkwk' + 'b'.repeat(14) + 'ddd',
  '....d' + 'l'.repeat(16) + 'dddddd',
  '......' + 'd'.repeat(16),
  '.......dd.....dd',
];

function paintRows(rows: string[]): Cells {
  const g = blank();
  rows.forEach((row, i) => {
    if (row.length > X_MAX - X_MIN + 1) throw new Error(`아다마스토르 ${i}행이 너무 깁니다 (${row.length})`);
    [...row].forEach((ch, j) => { g[Y_MIN + i][X_MIN + j] = ch as Role; });
  });
  return g;
}

// ── 검증과 출력 ──
function check(id: string, g: Cells): void {
  const bad: string[] = [];
  const cells: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] !== '.') {
    cells.push([x, y]);
    if (x < X_MIN || x > X_MAX || y < Y_MIN || y > Y_MAX) bad.push(`안전 영역 밖 (${x},${y})`);
  }
  const seen = new Set<string>(), stack = [cells[0]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const k = `${x},${y}`;
    if (seen.has(k) || x < 0 || y < 0 || x >= W || y >= H || g[y][x] === '.') continue;
    seen.add(k);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  if (seen.size !== cells.length) bad.push(`4방향 연결되지 않은 셀 ${cells.length - seen.size}개`);
  if (bad.length) throw new Error(`${id}: ${bad.slice(0, 5).join(', ')}\n${g.map(r => r.join('')).join('\n')}`);
}

function write(dir: string, key: string, g: Cells, pal: Record<Exclude<Role, '.'>, string>): void {
  const bmp = new Bitmap(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] !== '.') bmp.fill(x, y, 1, 1, pal[g[y][x] as Exclude<Role, '.'>]);
  writeFileSync(resolve(dir, `${key}.png`), bmp.png());
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, 'png/fish'));
mkdirSync(outDir, { recursive: true });

for (const s of SPECS) {
  const g = paintFish(s);
  check(s.id, g);
  write(outDir, s.id, g, colors(s.base, s));
  write(outDir, `${s.id}.variant`, g, colors(s.variant, s));
}
const adam = paintRows(ADAMASTOR);
check('adamastor', adam);
write(outDir, 'adamastor', adam, colors('#4d5560', { whiteBelly: false } as Spec));
console.log(`${SPECS.length * 2 + 1} PNG → ${outDir}`);
