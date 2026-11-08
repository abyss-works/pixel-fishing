// 남대서양 신규 어종 원화 생성 CLI — 32×16 원화 PNG를 어종마다 일반·변이 한 쌍으로 만든다.
// 사용: npx tsx tools/sprite-draft/draft-south-atlantic.ts [출력 폴더]
// 기본 출력은 tools/sprite-draft/png/fish. 이어서 import-png.ts 로 원화 격자를 다시 만들고,
// style-check.ts 로 기존 원화의 화풍 범위에 드는지 검사한다.
// 두 방식을 쓴다. 틀 복제(clone)는 실루엣이 비슷한 기존 원화를 역할별 색으로 옮겨 길이·무늬만 바꾸고,
// 매개변수(param)는 기존 원화에서 뽑은 형태 어휘(지느러미 가시 줄·끝단 하이라이트, 다색 꼬리,
// 줄무늬·점·비늘 무늬, 아가미 줄 수, 눈 한 칸과 반사광 한 칸)로 몸을 직접 그린다.
// 초안 전용이다. 확정 원화는 PNG를 직접 다듬어 이 폴더에 덮어쓴다.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bitmap } from './png';
import { gridFromPng } from './styleMetrics';

type Role = '.' | 'd' | 'b' | 'l' | 'k' | 'a' | 'y' | 'e' | 'w';
type Cells = Role[][];

const W = 32, H = 16;
const X_MIN = 2, X_MAX = 29, Y_MIN = 2, Y_MAX = 13;

interface Tail {
  kind: 'fork' | 'lunate' | 'square' | 'round' | 'shark'; len: number; spread: number; role?: Role;
  /** 갈래 맨 위·아래 칸의 색 */
  edge?: Role;
  /** 한 줄 건너 한 줄 속칸에 넣는 가시 색 */
  rays?: Role;
}
interface Fin {
  t0: number; t1: number; h: number; kind?: 'flat' | 'tri' | 'sail' | 'rear'; role?: Role;
  /** 끝단 칸의 하이라이트 색(높이 2 이상) */
  tip?: Role;
  /** 한 줄 건너 한 줄 뿌리 칸에 넣는 가시 줄 색 */
  rays?: Role;
}
interface PaintCtx { x: number; y: number; t: number; u: number; rx: number }
type Paint = (c: PaintCtx) => Role | undefined;
interface Base {
  id: string;
  base: string;
  /** 변이 색. 변이가 없는 네임드는 비운다. */
  variant?: string;
  accent?: { a?: string; y?: string };
  whiteBelly?: boolean;
}
interface ParamSpec extends Base {
  x0: number; x1: number; yc: number; top: number; bot: number;
  snout?: number; head?: number; ped?: number; tf?: number;
  tail: Tail;
  dorsal?: Fin[]; ventral?: Fin[];
  /** 눈 한 칸이 기본이고 위에 반사광 한 칸이 붙는다. size가 2 이상이면 눈동자 덩어리의 왼쪽 위가 반사광이다. */
  eye: { t: number; dy: number; size?: 1 | 2 | 3 };
  /** 세로 아가미 줄 위치. 비우면 아가미 없음, 셋이면 상어류 세 줄 */
  gill?: number[]; mouth?: number;
  pect?: { len: number; dy: number; role?: Role };
  paint?: Paint;
  extra?: (set: (x: number, y: number, r: Role) => void, s: { x0: number; yc: number; x1: number }) => void;
}
interface CloneSpec extends Base {
  /** 틀로 쓸 기존 원화 id */
  from: string;
  /** 틀 원화의 색(hex) → 역할. 눈 색과 반사광 색은 그대로 옮긴다. */
  roles: Record<string, Role>;
  edit: (e: Editor) => void;
}
type Spec = ParamSpec | CloneSpec;

const blank = (): Cells => Array.from({ length: H }, () => Array<Role>(W).fill('.'));

// ── 무늬 어휘 (매개변수 방식의 paint에 쓴다) ──
/** 세로 줄무늬: 몸 앞뒤 구간(t0~t1)에서 every칸마다, 몸 높이 비율 from~to 구간에 */
const stripes = (every: number, from: number, to: number, role: Role, t0 = 0.25, t1 = 0.8): Paint =>
  c => (c.t >= t0 && c.t <= t1 && c.rx % every === 0 && c.u >= from && c.u <= to ? role : undefined);
/** 점 무늬: 몸 앞끝 기준 칸 좌표 */
const spotsAt = (pts: [number, number][], yc: number, role: Role): Paint =>
  c => (pts.some(([dx, dy]) => c.rx === dx && c.y === yc + dy) ? role : undefined);
/** 비늘 무늬: 한 행 건너 엇갈리는 점, 몸 높이 비율 from~to 구간에 */
const scales = (role: Role, from: number, to: number, t0 = 0.2, t1 = 0.75): Paint =>
  c => (c.t >= t0 && c.t <= t1 && c.u >= from && c.u <= to && (c.rx + (c.y % 2) * 2) % 4 === 0 ? role : undefined);
const layers = (...ps: Paint[]): Paint => c => { for (const p of ps) { const r = p(c); if (r) return r; } return undefined; };

function paintFish(s: ParamSpec): Cells {
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
      for (let k = 1; k <= hh; k++) {
        let r: Role = f.role ?? 'd';
        if (f.tip && hh >= 2 && k === hh) r = f.tip;
        else if (f.rays && k === 1 && i % 2 === 1) r = f.rays;
        set(x, dir < 0 ? colTop[x] - k : colBot[x] + k, r);
      }
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
      if (i >= 2) notch = Math.max(0, up - 3);
    }
    const ys: number[] = [];
    for (let dy = -up; dy <= dn; dy++) {
      if (notch > 0 && T.kind !== 'shark' && Math.abs(dy) < notch) continue;
      if (T.kind === 'shark' && notch > 0 && dy > -up + 2 && dy < -1 && i >= 2) continue;
      set(x, s.yc + dy, tr); ys.push(s.yc + dy);
    }
    if (T.edge && ys.length > 1) { set(x, ys[0], T.edge); set(x, ys[ys.length - 1], T.edge); }
    if (T.rays && i % 2 === 1) for (const y of ys.slice(1, -1)) set(x, y, T.rays);
  }

  // 머리 부위
  const ex = Math.round(s.x0 + s.eye.t * len), ey = s.yc - s.eye.dy;
  const sz = s.eye.size ?? 1;
  for (let a = 0; a < sz; a++) for (let b = 0; b < sz; b++) if (opaque(ex + a, ey + b)) set(ex + a, ey + b, a === 0 && b === 0 && sz > 1 ? 'w' : 'e');
  if (sz === 1 && opaque(ex, ey)) { set(ex, ey, 'e'); if (opaque(ex, ey - 1)) set(ex, ey - 1, 'w'); }
  for (const gt of s.gill ?? []) {
    const gx = Math.round(s.x0 + gt * len);
    for (let y = colTop[gx] + 1; y <= colBot[gx] - 1; y++) if (opaque(gx, y) && !(gx >= ex && gx < ex + sz && y >= ey - 1 && y < ey + sz)) set(gx, y, 'k');
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

// ── 틀 복제 ──
const here = dirname(fileURLToPath(import.meta.url));
const FISH_DIR = resolve(here, 'png/fish');
const EYE_HEX = '#0b1322', GLINT_HEX = '#f8fcff';

/** 틀 원화 위에서 칸 단위로 고치는 도구. 좌표는 32×16 격자의 (x, y)다. */
class Editor {
  constructor(public g: Cells) {}
  get(x: number, y: number): Role { return x >= 0 && y >= 0 && x < W && y < H ? this.g[y][x] : '.'; }
  set(x: number, y: number, r: Role): this { if (x >= 0 && y >= 0 && x < W && y < H) this.g[y][x] = r; return this; }
  /** 이미 칠해진 칸만 바꾼다 */
  tint(x: number, y: number, r: Role): this { if (this.get(x, y) !== '.') this.g[y][x] = r; return this; }
  /** 역할 from인 칸 가운데 조건에 맞는 칸을 to로 바꾼다 */
  swap(from: Role, to: Role, when: (x: number, y: number) => boolean = () => true): this {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.g[y][x] === from && when(x, y)) this.g[y][x] = to;
    return this;
  }
  /** 칸 목록을 같은 역할로 칠한다(칠해진 칸만) */
  dots(pts: [number, number][], r: Role): this { for (const [x, y] of pts) this.tint(x, y, r); return this; }
  /** x열을 n번 더 복제해 오른쪽을 밀어낸다 */
  stretch(x: number, n: number): this {
    for (let y = 0; y < H; y++) { const v = this.g[y][x]; this.g[y].splice(x, 0, ...Array<Role>(n).fill(v)); this.g[y].length = W; }
    return this;
  }
  /** x열을 지우고 오른쪽을 당긴다 */
  squeeze(x: number): this {
    for (let y = 0; y < H; y++) { this.g[y].splice(x, 1); this.g[y].push('.'); }
    return this;
  }
  /** y행을 n번 더 복제해 아래를 밀어낸다 */
  grow(y: number, n: number): this { this.g.splice(y, 0, ...Array.from({ length: n }, () => [...this.g[y]])); this.g.length = H; return this; }
  /** y행을 지우고 아래를 당긴다 */
  drop(y: number): this { this.g.splice(y, 1); this.g.push(Array<Role>(W).fill('.')); return this; }
  shift(dx: number, dy: number): this {
    const out = blank();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.g[y][x] !== '.') {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) throw new Error(`shift 후 격자 밖 (${nx},${ny})`);
      out[ny][nx] = this.g[y][x];
    }
    this.g = out; return this;
  }
}

function cloneFish(s: CloneSpec): Cells {
  const grid = gridFromPng(readFileSync(resolve(FISH_DIR, `${s.from}.png`)));
  const g = blank();
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
    const c = grid.cells[y][x];
    if (!c) continue;
    const role = c === EYE_HEX ? 'e' : c === GLINT_HEX ? 'w' : s.roles[c];
    if (!role) throw new Error(`${s.id}: 틀 ${s.from}의 색 ${c}에 역할이 없습니다`);
    g[y][x] = role;
  }
  const e = new Editor(g);
  s.edit(e);
  return e.g;
}

// ── 색 ──
const hexToRgb = (h: string): [number, number, number] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = (c: number[]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const scale = (c: number[], f: number) => c.map(v => v * f);
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

function colors(base: string, s: Base): Record<Exclude<Role, '.'>, string> {
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
    e: EYE_HEX,
    w: GLINT_HEX,
  };
}

// ── 어종 명세 ──
const SPECS: Spec[] = [
  // 작고 가는 은빛 몸. 정어리 틀에서 몸을 늘리고 옆줄 은띠를 둔다.
  { id: 'capeanchovy', base: '#a9b7c2', variant: '#4b5a66', from: 'sardineS',
    roles: { '#695b5e': 'd', '#a1887f': 'b', '#cdb9a8': 'l', '#3c3643': 'k' },
    edit: e => { e.dots([[12, 8], [13, 8]], 'l').stretch(13, 2); } },
  // 전갱이 틀. 꼬리와 옆 비늘줄을 노랗게 둔다.
  { id: 'capejack', base: '#7d93a5', variant: '#e0b23e', from: 'trevally',
    roles: { '#78909c': 'b', '#4d6072': 'd', '#b4bebc': 'l' },
    edit: e => {
      e.swap('l', 'y', x => x >= 22);
      e.dots([[10, 6], [10, 7], [10, 8], [10, 9]], 'k');
      e.dots([[13, 6], [16, 6], [18, 7]], 'd');
      e.dots([[12, 9], [14, 9], [16, 9]], 'y');
      e.stretch(14, 2);
    } },
  // 고등어 틀. 줄무늬를 걷고 얼룩과 둘째 등지느러미를 둔다.
  { id: 'capehake', base: '#8fa1ae', variant: '#e3eaef', from: 'mackerel',
    roles: { '#286eae': 'd', '#42a5f5': 'b', '#144275': 'k', '#92cbf8': 'l' },
    edit: e => {
      e.swap('k', 'b');
      e.dots([[11, 6], [14, 5], [14, 8], [17, 7], [13, 7]], 'd');
      e.dots([[18, 5], [19, 5]], 'd');
      e.stretch(13, 2);
    } },
  // 꽁치 틀. 길게 늘려 턱이 긴 몸을 만든다.
  { id: 'snoek', base: '#5f7f94', variant: '#d3dde3', from: 'saury',
    roles: { '#5d6e7e': 'd', '#90a4ae': 'b', '#c3cac8': 'l', '#e7e7dd': 'y', '#344257': 'k' },
    edit: e => {
      e.dots([[13, 8], [16, 8], [19, 8]], 'd');
      e.stretch(12, 4);
    } },
  // 방어 틀. 옆줄 노란 띠는 뒤쪽만 두고 꼬리를 노랗게 둔다.
  { id: 'kingfish', base: '#5f8fa6', variant: '#cfd8dc', from: 'yellowtail', whiteBelly: true,
    roles: { '#4d6072': 'd', '#78909c': 'b', '#ffd54f': 'y', '#b4bebc': 'l' },
    edit: e => {
      e.swap('l', 'y', x => x >= 22);
      e.swap('y', 'l', (x, y) => x < 14 && y === 8);
      e.stretch(11, 2);
    } },
  // 메기 틀. 수염을 이빨로 바꾸고 몸을 키운다.
  { id: 'toothfish', base: '#3e4f5c', variant: '#25343f', from: 'catfish',
    roles: { '#34495b': 'd', '#546e7a': 'b', '#9da9a5': 'l', '#d4d6c7': 'a' },
    edit: e => {
      e.swap('a', 'w', x => x < 8);
      e.dots([[11, 6], [11, 7], [11, 8], [11, 9]], 'k');
      e.dots([[14, 7], [16, 8], [13, 8], [17, 6]], 'k');
      e.stretch(12, 2);
    } },
  // 만다린 틀. 머리에 청록 띠를 둔다.
  { id: 'sthwrasse', base: '#d98f4e', variant: '#f1ece4', from: 'mandarin', accent: { a: '#3fb7b0' },
    roles: { '#695b5e': 'd', '#a1887f': 'b', '#cdb9a8': 'l', '#3c3643': 'k' },
    edit: e => {
      e.dots([[10, 6], [10, 7], [10, 8]], 'a');
      e.dots([[10, 3], [12, 3]], 'l').dots([[11, 4], [13, 4]], 'k');
      e.swap('l', 'a', x => x >= 22);
      e.stretch(16, 2);
    } },
  // 복어 틀. 점 위치를 바꾸고 높이를 줄인다.
  { id: 'sthpuffer', base: '#b79b6b', variant: '#e6c14a', from: 'pufferfish',
    roles: { '#e8c547': 'b', '#998438': 'd', '#f9df82': 'l', '#fff1b1': 'a', '#59502c': 'k' },
    edit: e => {
      e.swap('k', 'b');
      e.dots([[11, 5], [14, 6], [17, 5], [12, 8], [16, 7]], 'k');
      e.drop(2).stretch(13, 2);
    } },
  // 흰동가리 틀. 흰 띠를 검은 띠 하나로 바꾸고 꼬리를 노랗게 둔다.
  { id: 'apollodamsel', base: '#4f86b8', variant: '#f0c93c', from: 'clownfish',
    roles: { '#a94a35': 'd', '#ff7043': 'b', '#ffaa80': 'l' },
    edit: e => {
      e.swap('w', 'k', x => x >= 13);
      e.swap('l', 'y', x => x >= 20);
      e.stretch(13, 2);
    } },
  // 별지느러미 틀. 뒤 등지느러미를 길게 늘인다.
  { id: 'ascensionangel', base: '#e8c04a', variant: '#f2efe6', from: 'starfin', accent: { a: '#4fa3d9' },
    roles: { '#29365b': 'd', '#43527a': 'b', '#9397a5': 'l', '#fff9c4': 'a' },
    edit: e => {
      e.dots([[17, 2], [18, 2], [19, 2]], 'a');
      e.set(20, 3, 'd').set(21, 3, 'd').set(22, 3, 'a');
      e.stretch(12, 1);
    } },
  // 왕고등어 틀. 세로 줄을 길게 늘린다.
  { id: 'wahoo', base: '#3f7fa0', variant: '#c8d4dc', from: 'kingmackerel', whiteBelly: true,
    roles: { '#607d8b': 'b', '#3c5366': 'd', '#a2afae': 'l', '#ffd54f': 'a', '#203248': 'k' },
    edit: e => { e.stretch(11, 3); } },
  // 푸른상어 틀. 아가미 세 줄을 둔다.
  { id: 'galapagosshark', base: '#6c7e8a', variant: '#aab8c2', from: 'blueshark', whiteBelly: true,
    roles: { '#2a3b4c': 'd', '#455a64': 'b', '#cfcfbe': 'l' },
    edit: e => {
      e.dots([[11, 6], [11, 7], [11, 8], [13, 6], [13, 7], [13, 8], [15, 6], [15, 7], [15, 8]], 'k');
      e.stretch(16, 2);
    } },
  // 나폴레옹 틀. 비늘 점과 아가미 줄을 둔다.
  { id: 'eolgedom', base: '#b0584d', variant: '#4a2623', from: 'napoleonfish',
    roles: { '#26a69a': 'b', '#156f70': 'd', '#81cbbb': 'l' },
    edit: e => {
      e.dots([[9, 6], [9, 7], [9, 8], [9, 9]], 'k');
      e.dots([[11, 2], [13, 2], [10, 3], [13, 3]], 'l');
      e.dots([[12, 6], [15, 6], [11, 7], [14, 7], [17, 7], [13, 8], [16, 8]], 'l');
      e.stretch(16, 1);
    } },
  // 도미 틀. 눈을 크게 키운다.
  { id: 'bigeye', base: '#c24a3c', variant: '#6d2a24', from: 'seabream',
    roles: { '#ef5350': 'b', '#9e373e': 'd', '#fd9889': 'l', '#80d8ff': 'a' },
    edit: e => {
      e.dots([[9, 8], [8, 9], [9, 9]], 'e');
      e.dots([[12, 6], [12, 7], [12, 8], [12, 9]], 'k');
      e.stretch(14, 1);
    } },
  // 매개변수 방식: 가늘고 긴 밤 메를루사. 비늘 점, 끝단 하이라이트, 다색 꼬리, 가시 줄을 쓴다.
  { id: 'nighthake', base: '#4d5f73', variant: '#27333f',
    x0: 3, x1: 20, yc: 8, top: 3, bot: 2, snout: 0.5, head: 0.32, ped: 0.25,
    tail: { kind: 'lunate', len: 4, spread: 3, edge: 'l', rays: 'k' },
    dorsal: [{ t0: 0.3, t1: 0.42, h: 2, kind: 'sail', tip: 'l' }, { t0: 0.55, t1: 0.82, h: 1, rays: 'k' }],
    ventral: [{ t0: 0.55, t1: 0.8, h: 1, rays: 'k' }],
    eye: { t: 0.1, dy: 2, size: 2 }, gill: [0.3], mouth: 1,
    paint: scales('k', 0.3, 0.7, 0.4, 0.85) },
  // 매개변수 방식: 어둡고 머리가 큰 이빨고기. 반사광 한 칸짜리 눈, 아가미 없음, 점 무늬.
  { id: 'darktoothfish', base: '#1b2631', variant: '#0b1118',
    x0: 2, x1: 21, yc: 7, top: 3, bot: 3, snout: 0.6, head: 0.42, ped: 0.25, tf: 0.66,
    tail: { kind: 'square', len: 4, spread: 2, edge: 'l', rays: 'k' },
    dorsal: [{ t0: 0.35, t1: 0.55, h: 2, tip: 'l' }, { t0: 0.6, t1: 0.8, h: 1, rays: 'k' }],
    ventral: [{ t0: 0.6, t1: 0.8, h: 1, rays: 'k' }],
    eye: { t: 0.1, dy: 1 }, mouth: 2, pect: { len: 3, dy: 1 },
    paint: layers(stripes(6, 0.3, 0.7, 'k', 0.5, 0.85), spotsAt([[11, -1], [12, -1], [9, 1]], 7, 'k')),
    extra: (set, s) => { for (const dx of [1, 3, 5]) set(s.x0 + dx, s.yc + 3, 'w'); } },
  // 네임드 아다마스토르: 아귀 틀을 넓혀 곶 같은 머리를 만들고 돌기를 입 앞까지 휘게 늘린다.
  { id: 'adamastor', base: '#4d5560', from: 'anglerfish',
    roles: { '#5d4037': 'b', '#3a2a2d': 'd', '#a38c78': 'l', '#00e5ff': 'a' },
    edit: e => {
      e.stretch(12, 5).grow(8, 1);
      for (let x = 7; x <= 17; x++) e.set(x, 2, 'k');
      e.dots([[13, 3], [16, 3]], 'k');
      e.dots([[13, 5], [16, 6], [12, 7], [18, 7], [14, 9], [20, 8], [17, 10], [21, 6], [19, 5]], 'd');
      e.dots([[11, 8], [15, 8], [18, 9]], 'l');
      e.dots([[8, 9], [10, 9], [12, 9]], 'w').dots([[9, 9], [11, 9], [13, 9]], 'k');
      e.dots([[12, 12], [14, 12], [16, 12]], 'w');
    } },
];

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

/** 색을 처음 나온 순서의 번호로 바꾼 격자 문자열 — 원화 격자 변환과 같은 기준이다. */
function normalizedKey(file: string): string {
  const grid = gridFromPng(readFileSync(file));
  const index = new Map<string, number>();
  return grid.cells.map(row => row.map(c => {
    if (!c) return '.';
    if (!index.has(c)) index.set(c, index.size);
    return String(index.get(c));
  }).join(',')).join('/');
}

function assertNoTwins(dir: string): void {
  const seen = new Map<string, string>();
  for (const f of readdirSync(dir).filter(n => n.endsWith('.png') && !n.includes('.variant')).sort()) {
    const k = normalizedKey(resolve(dir, f));
    const prev = seen.get(k);
    if (prev) throw new Error(`같은 그림: ${prev} 와 ${f}`);
    seen.set(k, f);
  }
}

const isClone = (s: Spec): s is CloneSpec => 'from' in s;
const outDir = resolve(process.argv[2] ?? FISH_DIR);
mkdirSync(outDir, { recursive: true });

for (const s of SPECS) {
  const g = isClone(s) ? cloneFish(s) : paintFish(s);
  check(s.id, g);
  write(outDir, s.id, g, colors(s.base, s));
  if (s.variant) write(outDir, `${s.id}.variant`, g, colors(s.variant, s));
  if (process.env.SHOW === s.id) console.log(g.map((r, y) => `${String(y).padStart(2)} ${r.join('')}`).join('\n'));
}
assertNoTwins(outDir);
console.log(`${SPECS.reduce((n, s) => n + (s.variant ? 2 : 1), 0)} PNG → ${outDir}`);
