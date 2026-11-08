// @vitest-environment node
// 마스크 생성기의 전지구 고정 원점 계약: 창(lonMin, cols 등)을 바꿔 다시 만들어도
// 같은 경위도는 같은 게임 좌표를, 같은 칸은 같은 전지구 격자 인덱스를 갖는다.
import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'mask-gen-'));
afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

// 작은 섬 하나(경도 120..122, 위도 10..12)와 큰 육지 하나(경도 60..70, 위도 -5..5)
const geoPath = join(tmp, 'geo.json');
writeFileSync(geoPath, JSON.stringify({
  source: 'test',
  rings: [
    [[120, 10], [122, 10], [122, 12], [120, 12], [120, 10]],
    [[60, -5], [70, -5], [70, 5], [60, 5], [60, -5]],
  ],
}));

const GLOBAL = { origin: { lon: -180, lat: 85.0344827586207 }, cellsPerDeg: { lon: 4, lat: 2.9 } };
const ANCHORS = {
  isle: { lon: 121, lat: 11, terrain: 'land' },
  open: { lon: 100.5, lat: 3.2, terrain: 'water' },
};

interface Out {
  anchors: Record<string, { x: number; y: number }>;
  offset: { col: number; row: number };
  globalCols: number;
  rows: string[];
}

function generate(name: string, window: object, cols: number, rows: number, globalGrid: object | null = GLOBAL) {
  const cfg = { id: name, geo: geoPath, cell: { w: 8, h: 11 }, grid: { cols, rows }, window,
    ...(globalGrid ? { globalGrid } : {}), anchors: ANCHORS };
  const out = join(tmp, `${name}.ts`);
  const r = spawnSync(process.execPath, ['tools/mask-from-earth.mjs', JSON.stringify(cfg), '--out', out],
    { encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr, out };
}

function parse(file: string): Out {
  const src = readFileSync(file, 'utf8');
  const anchors: Out['anchors'] = {};
  for (const m of src.matchAll(/^\s+(\w+): \{ x: (-?\d+), y: (-?\d+) \},$/gm)) anchors[m[1]] = { x: +m[2], y: +m[3] };
  const off = /GRID_OFFSET.* = \{ col: (\d+), row: (\d+) \}/.exec(src)!;
  const gc = /GLOBAL_COLS = (\d+)/.exec(src)!;
  const rows = [...src.matchAll(/^ {2}'([.L0-9a-z]+)',$/gm)].map(m => m[1]);
  return { anchors, offset: { col: +off[1], row: +off[2] }, globalCols: +gc[1], rows };
}

// 두 창의 격자를 전지구 (열, 행)으로 펴서 육지 칸 집합을 만든다
const landSet = (o: Out) => {
  const s = new Set<number>();
  o.rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === 'L') s.add((r + o.offset.row) * o.globalCols + c + o.offset.col);
  }));
  return s;
};

describe('마스크 생성기 전지구 원점', () => {
  const a = generate('win-a', { lonMin: 35, lonMax: 157, latMin: -36, latMax: 44 }, 488, 232);
  // 서쪽 끝을 40E로 줄이고 남쪽을 넓힌 다른 창 — 해상도는 같다
  const b = generate('win-b', { lonMin: 40, lonMax: 157, latMin: 44 - 244 / 2.9, latMax: 44 }, 468, 244);

  // 북단이 10행 남쪽인 창 — 행 오프셋이 달라도 같은 결과여야 한다
  const northB = 44 - 10 / 2.9;
  const d = generate('win-c', { lonMin: 35, lonMax: 157, latMin: northB - 232 / 2.9, latMax: northB }, 488, 232);

  it('북단이 다른 창도 생성되고 행 오프셋이 그만큼 늘어난다', () => {
    expect(d.status, d.stderr).toBe(0);
    expect(parse(d.out).offset).toEqual({ col: (35 + 180) * 4, row: 129 });
  });

  it('북단이 다른 창에서도 같은 경위도는 같은 게임 좌표이고 같은 칸은 같은 인덱스다', () => {
    const pa = parse(a.out), pd = parse(d.out);
    expect(pd.anchors).toEqual(pa.anchors);
    const la = landSet(pa), ld = landSet(pd);
    // 두 창이 겹치는 행(전지구 행 129 이상, 창 a 기준 10행부터)만 비교한다
    const overlap = (set: Set<number>) => [...set].filter(i => Math.floor(i / pa.globalCols) >= 129
      && Math.floor(i / pa.globalCols) < 119 + 232).sort((x, y) => x - y);
    expect(overlap(ld)).toEqual(overlap(la));
    expect(overlap(la).length).toBeGreaterThan(0);
  });

  it('두 창 모두 생성된다', () => {
    expect(a.stderr).not.toMatch(/오류/);
    expect(a.status).toBe(0);
    expect(b.stderr).not.toMatch(/오류/);
    expect(b.status).toBe(0);
  });

  it('창이 달라도 같은 경위도는 같은 게임 좌표다', () => {
    const pa = parse(a.out), pb = parse(b.out);
    expect(pb.anchors).toEqual(pa.anchors);
    // 원점(-180, 85.03...)에서 경도 1도 = 4열 = 32px
    expect(pa.anchors.isle.x).toBe(Math.round((121 + 180) * 32));
  });

  it('창의 서북 모서리는 원점에서 정수 칸 떨어진 자리다', () => {
    expect(parse(a.out).offset).toEqual({ col: (35 + 180) * 4, row: 119 });
    expect(parse(b.out).offset).toEqual({ col: (40 + 180) * 4, row: 119 });
  });

  it('같은 칸은 창과 무관하게 같은 전지구 격자 인덱스를 갖는다', () => {
    const la = landSet(parse(a.out)), lb = landSet(parse(b.out));
    expect(la.size).toBeGreaterThan(0);
    expect([...lb].sort()).toEqual([...la].sort());
  });

  it('창의 해상도가 전지구 격자와 다르면 생성을 거부한다', () => {
    const bad = generate('win-bad', { lonMin: 35, lonMax: 157, latMin: -36, latMax: 44 }, 244, 232);
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/전지구 격자/);
  });

  it('창 서북 모서리가 정수 칸이 아니면 생성을 거부한다', () => {
    const bad = generate('win-frac', { lonMin: 35.1, lonMax: 157.1, latMin: -36, latMax: 44 }, 488, 232);
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/정수 칸/);
  });

  it('전지구 격자를 지정하지 않으면 창의 서북 모서리가 원점이다', () => {
    const c = generate('win-local', { lonMin: 35, lonMax: 157, latMin: -36, latMax: 44 }, 488, 232, null);
    expect(c.status).toBe(0);
    const p = parse(c.out);
    expect(p.offset).toEqual({ col: 0, row: 0 });
    expect(p.anchors.isle.x).toBe(Math.round((121 - 35) * 32));
  });
});

describe('islands — 작은 섬 한 칸', () => {
  const win = { lonMin: 55, lonMax: 75, latMin: 24, latMax: 44 };
  const run = (islands: object[], zones: object[] = []) => {
    const cfg = { id: 'isl', geo: geoPath, cell: { w: 8, h: 11 }, grid: { cols: 80, rows: 58 }, window: win,
      globalGrid: GLOBAL, islands, zones };
    const out = join(tmp, 'isl.ts');
    const r = spawnSync(process.execPath, ['tools/mask-from-earth.mjs', JSON.stringify(cfg), '--out', out],
      { encoding: 'utf8' });
    return { status: r.status, rows: parse(out).rows };
  };
  const rowAt = (rows: string[], lat: number) => rows[Math.floor((44 - lat) * 2.9)];
  const colAt = (lon: number) => Math.floor((lon - 55) * 4);

  it('경위도가 속한 칸 하나만 육지로 찍는다', () => {
    const r = run([{ name: '섬', lon: 60.1, lat: 40.2 }]);
    expect(r.status).toBe(0);
    expect(rowAt(r.rows, 40.2)[colAt(60.1)]).toBe('L');
    expect(r.rows.join('').split('L').length - 1).toBe(1);
  });

  it('수역 타원이 섬을 덮지 않고 둘러싼다', () => {
    const r = run([{ name: '섬', lon: 60.1, lat: 40.2 }], [{ ch: 'h', name: '해역', lon: 60.1, lat: 40.2, rx: 1, ry: 1 }]);
    expect(rowAt(r.rows, 40.2)[colAt(60.1)]).toBe('L');
    expect(rowAt(r.rows, 40.2)[colAt(60.1) + 1]).toBe('h');
  });
});
