import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FISH } from '../../../src/game/content/fish';
import { SPOTS } from '../../../src/game/content/spots';
import { upgradeCost } from '../../../src/game/rules/balance';
import { applyOverride, parseOverride } from './override';
import { addPerSpot, designReport, parseAnchor, parseGrade, parseNight } from './design';
import type { DesignInput, DesignReport } from './design';
import { runCli } from './report';
import { transitionReport } from './transitions';

const empty = { all: null, by: {} } as const;
const base = (o: Partial<DesignInput> = {}): DesignInput => ({
  start: 25, growth: 0.15, gap: { all: 5, by: {} }, hours: { all: 3, by: {} }, payback: null, boatShare: 0,
  grades: {}, night: {}, anchors: [], solve: null, maxDays: 365, ...o,
});
const STH = SPOTS.findIndex(s => s.id === 'sthelena');

describe('design 입력 해석', () => {
  it('값 하나는 기본값이고 해역=값은 그 해역만 바꾼다', () => {
    const p = { all: null as number | null, by: {} as Record<string, number> };
    addPerSpot(p, '--gap', '5');
    addPerSpot(p, '--gap', 'sea=4');
    expect(p).toEqual({ all: 5, by: { sea: 4 } });
    expect(() => addPerSpot(p, '--gap', 'nowhere=4')).toThrow(/없는 해역/);
    expect(() => addPerSpot(p, '--gap', 'sea=x')).toThrow(/숫자/);
    expect(() => addPerSpot(p, '--gap', 'x')).toThrow(/숫자/);
  });

  it('등급, 밤 배율, 기준점 형식을 검사한다', () => {
    expect(parseGrade('희귀=1.5:1.03')).toEqual({ grade: 'rare', curve: { base: 1.5, step: 1.03 } });
    expect(parseGrade('legendary=4')).toEqual({ grade: 'legendary', curve: { base: 4, step: 1 } });
    expect(() => parseGrade('일반=2:1')).toThrow(/등급/);
    expect(() => parseGrade('희귀=0:1')).toThrow(/0보다/);
    expect(parseNight('영웅=1.7')).toEqual({ grade: 'epic', mult: 1.7 });
    expect(() => parseNight('영웅')).toThrow(/형식/);
    expect(parseAnchor('sthelena=942,379')).toEqual({ spot: 'sthelena', ev: 942379 });
    expect(() => parseAnchor('sthelena=-1')).toThrow(/형식/);
    expect(() => parseAnchor('nowhere=5')).toThrow(/없는 해역/);
  });
});

describe('design 계산', () => {
  let r: DesignReport;
  beforeAll(() => { r = designReport(base({ boatShare: 0.15, hours: { all: 3, by: { river: 2 } } })); }, 60_000);

  it('진입 레벨은 첫 해역 1에서 간격만큼 올라가고 요구 파워는 그 레벨의 파워다', () => {
    expect(r.rows.map(x => x.level)).toEqual(SPOTS.map((_, i) => 1 + 5 * i));
    expect(r.rows[1].power).toBe(r.rows[0].power + 5 * 5);
    expect(r.rows.at(-1)!.gap).toBeNull();
  });

  it('필요 진입 EV는 (구간 강화비 합 + 배 가격) ÷ H이고 구간 강화비는 단일 지수 곡선의 합이다', () => {
    const undo = applyOverride({ rod: { costBase: 25, costGrowth: 1.15, costPowerFrom: 1_000_000 } });
    try {
      const expectSum = (from: number) => [0, 1, 2, 3, 4].reduce((s, k) => s + upgradeCost(from + k), 0);
      r.rows.slice(0, -1).forEach(x => {
        expect(x.upgradeSum).toBeCloseTo(expectSum(x.level), 6);
        const h = x.spot === 'river' ? 2 : 3;
        expect(x.requiredEv).toBeCloseTo((x.upgradeSum! + x.boatPrice!) / h, 6);
        expect(x.hours).toBe(h);
      });
      expect(upgradeCost(1)).toBe(25);
    } finally { undo(); }
  });

  it('배 가격은 전환 골드의 비중이고 새로 사는 배가 없는 구간은 0이다', () => {
    r.rows.slice(0, -1).forEach((x, i) => {
      const boats = SPOTS[i + 1].boatTier > SPOTS[i].boatTier;
      if (!boats) expect(x.boatPrice).toBe(0);
      else expect(x.boatPrice! / (x.boatPrice! + x.upgradeSum!)).toBeCloseTo(0.15, 9);
    });
    const tiers = Object.values(r.override.boats!);
    expect(tiers.every(b => b.fameReq === 0)).toBe(true);
  });

  it('등급 비율을 바꾸지 않으면 가격 배율은 필요 EV ÷ 현재 EV이고 몫의 합은 1이다', () => {
    for (const x of r.rows) {
      expect(x.priceMult).toBeCloseTo(x.evRatio, 9);
      const sum = Object.values(x.grades).reduce((s, c) => s + (c?.evShare ?? 0), 0);
      expect(sum).toBeCloseTo(1, 9);
    }
  });

  it('역전 검사는 앞 해역의 다음 해역 진입 직전 레벨을 잰다', () => {
    expect(r.reversals).toHaveLength(SPOTS.length - 1);
    r.reversals.forEach((x, i) => {
      expect(x.level).toBe(r.rows[i + 1].level - 1);
      expect(x.reversed).toBe(x.ev > x.nextEv);
    });
    expect(r.boostEnds).toEqual({ village: 6, world: 4 });
  });

  it('계산을 마치면 제품 상수가 원래대로 돌아온다', () => {
    const before = [upgradeCost(5), SPOTS[3].powerReq, FISH.find(f => f.id === 'apollodamsel')!.price];
    designReport(base({ gap: { all: 4, by: {} }, hours: { all: 2, by: {} } }));
    expect([upgradeCost(5), SPOTS[3].powerReq, FISH.find(f => f.id === 'apollodamsel')!.price]).toEqual(before);
  }, 60_000);
});

describe('design 등급 가격 비율', () => {
  let r: DesignReport, plain: DesignReport;
  beforeAll(() => {
    plain = designReport(base());
    r = designReport(base({ grades: { rare: { base: 5, step: 1.02 }, legendary: { base: 100, step: 1.05 } }, night: { legendary: 1.5, epic: 1.4 } }));
  }, 60_000);

  it('EV 목표는 그대로이고 일반 가격이 차이를 흡수한다', () => {
    r.rows.forEach((x, i) => {
      expect(x.requiredEv).toBeCloseTo(plain.rows[i].requiredEv, 6);
      expect(Object.values(x.grades).reduce((s, c) => s + (c?.evShare ?? 0), 0)).toBeCloseTo(1, 9);
    });
    expect(r.rows[STH].priceMult).not.toBeCloseTo(plain.rows[STH].priceMult, 3);
  });

  it('일반 최대가 대비 낮 어종 최대가가 base x step^순번이고 밤 어종은 낮 어종 x 밤 배율이다', () => {
    const c = r.rows[STH].grades;
    expect(c.rare!.ratio).toBeCloseTo(5 * 1.02 ** STH, 9);
    expect(c.legendary!.ratio).toBeCloseTo(100 * 1.05 ** STH, 9);
    expect(c.legendary!.nightRatio! / c.legendary!.ratio!).toBeCloseTo(1.5, 9);
    expect(c.epic!.nightRatio! / c.epic!.ratio!).toBeCloseTo(1.4, 9);
  });

  it('덮어쓰기에 등급 배율과 밤 배율이 담기고 파서가 받아들인다', () => {
    const spot = r.override.spots!.sthelena;
    expect(spot.gradeMult).toBeDefined();
    expect(spot.nightMult).toBeDefined();
    expect(() => parseOverride(JSON.parse(JSON.stringify(r.override)))).not.toThrow();
  });

  it('현재 가격의 등급 계수 예가 마지막 해역 비율을 재현한다', () => {
    const rare = plain.example.find(x => x.grade === 'rare')!;
    expect(rare.base * rare.step ** (SPOTS.length - 1)).toBeCloseTo(8700 / 66, 9);
    expect(plain.example.find(x => x.grade === 'epic')!.night).toBeCloseTo(66000 / 39000, 9);
    expect(plain.example.find(x => x.grade === 'legendary')!.night).toBeCloseTo(840000 / 520000, 9);
  });
});

describe('design 기준점 풀이(회수 시간 방식)', () => {
  const anchor = [{ spot: 'sthelena' as const, ev: 942379 }];
  const pb = { base: 0.5, growth: 0 };

  it('gap: 기준점 진입 레벨에 가장 가까운 레벨로 구간 합을 정하고 앞 해역에 균등 분배한다', () => {
    const r = designReport(base({ gap: empty, hours: null, payback: pb, anchors: anchor, solve: 'gap' }));
    const gaps = r.resolved.gaps.slice(0, STH) as number[];
    expect(gaps.reduce((s, g) => s + g, 0)).toBe(r.rows[STH].level - 1);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    const firstBig = gaps.findIndex(g => g === Math.max(...gaps));
    expect(gaps.slice(firstBig).every(g => g === Math.max(...gaps))).toBe(true);
    expect(Math.abs(r.anchors[0].error)).toBeLessThan(0.15);
  }, 60_000);

  it('growth: 증가율을 풀어 기준점 오차가 거의 없다', () => {
    const r = designReport(base({ growth: null, gap: { all: 6, by: {} }, hours: null, payback: pb, anchors: anchor, solve: 'growth' }));
    expect(Math.abs(r.anchors[0].error)).toBeLessThan(1e-3);
    expect(r.resolved.growth).toBeGreaterThan(0.1);
  }, 60_000);

  it('payback: 회수 시간을 풀어 기준점 오차가 거의 없다', () => {
    const r = designReport(base({ gap: { all: 6, by: {} }, hours: null, payback: { base: null, growth: 0 }, anchors: anchor, solve: 'payback' }));
    expect(Math.abs(r.anchors[0].error)).toBeLessThan(1e-9);
  }, 60_000);

  it('회수 시간 방식은 진입 EV가 진입 레벨 강화비 ÷ h이고 전환 시간은 h의 합이다', () => {
    const r = designReport(base({ hours: null, payback: { base: 0.5, growth: 0.02 } }));
    const x = r.rows[3];
    const h = (lv: number) => 0.5 * 1.02 ** (lv - 1);
    const undo = applyOverride({ rod: { costBase: 25, costGrowth: 1.15, costPowerFrom: 1_000_000 } });
    try { expect(x.requiredEv).toBeCloseTo(upgradeCost(x.level) / h(x.level), 6); } finally { undo(); }
    expect(x.hours).toBeCloseTo([0, 1, 2, 3, 4].reduce((s, k) => s + h(x.level + k), 0) + x.boatPrice! / x.requiredEv, 9);
  }, 60_000);

  it('풀 변수의 입력과 함께 주거나 기준점이 없거나 시간 목표 방식이면 거부한다', () => {
    expect(() => designReport(base({ hours: null, payback: pb, anchors: anchor, solve: 'gap' }))).toThrow(/함께/);
    expect(() => designReport(base({ gap: empty, hours: null, payback: pb, anchors: [], solve: 'gap' }))).toThrow(/기준점/);
    expect(() => designReport(base({ gap: empty, solve: 'gap', anchors: anchor }))).toThrow(/회수 시간 방식/);
  });
});

describe('design 덮어쓰기 내보내기와 전환 시간', () => {
  let dir: string;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'design-')); return () => rmSync(dir, { recursive: true, force: true }); });

  it('--emit-override 파일을 transition에 넣으면 골드 전환 시간이 목표 H와 맞는다', () => {
    const file = join(dir, 'ov.json');
    const out = runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--hours', '3', '--emit-override', file]);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain('덮어쓰기를');
    const ov = parseOverride(JSON.parse(readFileSync(file, 'utf-8')));
    const undo = applyOverride(ov);
    try {
      const t = transitionReport({ axis: 'idle', maxDays: 365 });
      expect(t.complete).toBe(true);
      // 진입 레벨이 낮은 해역은 어종 가격(정수)이 너무 작아 반올림이 크므로, 가격이 충분한 뒤 해역에서 맞춘다.
      // 시뮬레이션은 강화를 살 수 있을 때마다 사서 EV가 오르므로 진입 EV로 계산한 H보다 조금 짧다
      t.timings.slice(7, 12).forEach(x => {
        expect(x.hours).toBeGreaterThan(3 * 0.7);
        expect(x.hours).toBeLessThan(3 * 1.05);
        expect(x.waitFame).toBe(0);
      });
    } finally { undo(); }
  }, 60_000);

  it('같은 덮어쓰기를 dist에 넣어도 돈다', () => {
    const file = join(dir, 'ov2.json');
    expect(runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '4', '--hours', '2', '--emit-override', file]).exitCode).toBe(0);
    const out = runCli(['dist', '--override', file, '--trials', '4']);
    expect(out.stderr).toBe('');
    expect(out.exitCode).toBe(0);
  }, 60_000);
});

describe('design 명령줄', () => {
  it('--hours와 --payback은 함께 줄 수 없고 --start가 필요하다', () => {
    expect(runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--hours', '3', '--payback', '0.5']).stderr).toMatch(/함께/);
    expect(runCli(['design', '--growth', '0.15', '--gap', '5', '--hours', '3']).stderr).toMatch(/--start/);
    expect(runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5']).stderr).toMatch(/--hours 또는 --payback/);
  });

  it('해역별 간격과 목표 시간을 여러 번 줄 수 있다', () => {
    const out = runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--gap', 'sea=4', '--hours', '3', '--hours', 'deep=2', '--anchor', 'none', '--json']);
    expect(out.stderr).toBe('');
    const d = (JSON.parse(out.stdout) as { design: DesignReport }).design;
    expect(d.rows.find(x => x.spot === 'sea')!.gap).toBe(4);
    expect(d.rows.find(x => x.spot === 'deep')!.hours).toBe(2);
    expect(d.anchors).toEqual([]);
  }, 60_000);

  it('기준점을 생략하면 세인트헬레나의 현재 진입 EV를 쓰고 다른 명령에서는 design 옵션을 받지 않는다', () => {
    const out = runCli(['design', '--start', '25', '--growth', '0.15', '--gap', '5', '--hours', '3', '--json']);
    const d = (JSON.parse(out.stdout) as { design: DesignReport }).design;
    expect(d.anchors.map(a => a.spot)).toEqual(['sthelena']);
    expect(d.anchors[0].anchorEv).toBeGreaterThan(900_000);
    expect(runCli(['transition', '--start', '25']).stderr).toMatch(/design/);
    expect(runCli(['ev', '--growth']).exitCode).toBe(0);
  }, 60_000);
});
