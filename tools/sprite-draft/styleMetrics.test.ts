// @vitest-environment node
// 원화 화풍 측정의 계약: 지표 정의와 합격 판정을 작은 합성 격자로 고정한다.
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  CANDIDATE_IDS, buildCriteria, gridFromRows, judgeSet, judgeSprite, measure, percentile, readSpriteDir,
} from './styleMetrics';

const EYE = '#0b1322', GLINT = '#f8fcff';

describe('measure', () => {
  it('같은 색 4방향 연결 영역과 1픽셀 점(눈 색 제외)을 센다', () => {
    const g = gridFromRows([
      'aab',
      'a.b',
      'c.e',
    ], { a: '#111111', b: '#222222', c: '#333333', e: EYE });
    const m = measure(g);
    expect(m.regions).toBe(4);
    expect(m.specks).toBe(1);
  });

  it('가로 같은색 인접 비율과 평균 단색 연속 길이를 낸다', () => {
    const g = gridFromRows(['aabb'], { a: '#111111', b: '#222222' });
    const m = measure(g);
    expect(m.hcoh).toBeCloseTo(2 / 3);
    expect(m.meanRun).toBeCloseTo(2);
  });

  it('두 색 이하만 쓴 행의 비율을 낸다(6칸 이상 행만 센다)', () => {
    const g = gridFromRows([
      'aaaaaa',
      'abcdef',
    ], { a: '#111111', b: '#222222', c: '#333333', d: '#444444', e: '#555555', f: '#666666' });
    expect(measure(g).bandRows).toBeCloseTo(0.5);
  });

  it('꼬리 끝 4열의 색 수와 몸 높이, 종횡비를 낸다', () => {
    const g = gridFromRows([
      'aaaabcd',
      'aaaabcd',
      'aaaa...',
    ], { a: '#111111', b: '#222222', c: '#333333', d: '#444444' });
    const m = measure(g);
    expect(m.tailColors).toBe(4);
    expect(m.bodyHeight).toBe(3);
    expect(m.aspect).toBeCloseTo(3 / 7);
  });

  it('눈 모양은 눈동자 칸 수와 반사광 유무로 분류한다', () => {
    const solo = gridFromRows(['aaaa', 'aeaa', 'aaaa'], { a: '#111111', e: EYE });
    const glint = gridFromRows(['aaaa', 'aweaa'.slice(0, 4), 'aaaa'], { a: '#111111', e: EYE, w: GLINT });
    const block = gridFromRows(['aaaa', 'aeea', 'aeaa'], { a: '#111111', e: EYE });
    expect(measure(solo).eye).toBe('1');
    expect(measure(glint).eye).toBe('1g');
    expect(measure(block).eye).toBe('3');
  });

  it('머리 쪽 세로 어두운 줄을 세어 아가미 줄 수로 분류한다', () => {
    const rows = [
      'bbkbbkbbbbbbbbbb',
      'bbkbbkbbbbbbbbbb',
      'bbkbbkbbbbbbbbbb',
      'bbbbbbbbbbbbbbbb',
    ];
    const g = gridFromRows(rows, { b: '#808080', k: '#202020' });
    expect(measure(g).gill).toBe(2);
    expect(measure(gridFromRows(['bbbb', 'bbbb', 'bbbb'], { b: '#808080' })).gill).toBe(0);
  });
});

describe('percentile', () => {
  it('하위·상위 10% 값을 순위로 고른다', () => {
    const a = Array.from({ length: 11 }, (_, i) => i);
    expect(percentile(a, 0.1)).toBe(1);
    expect(percentile(a, 0.9)).toBe(9);
  });
});

describe('판정', () => {
  const ref = readSpriteDir(resolve(__dirname, 'png/fish'), new Set(CANDIDATE_IDS));
  const criteria = buildCriteria(ref.map(r => measure(r.grid)));

  it('기준 집합은 신규 후보를 제외한 기존 원화다', () => {
    expect(ref.length).toBeGreaterThanOrEqual(80);
    expect(ref.some(r => CANDIDATE_IDS.includes(r.id))).toBe(false);
  });

  it('가로 띠 3단뿐인 단순 그림은 여러 지표에서 탈락한다', () => {
    const rows = [
      '..dddddddddd....',
      '.bbbbbbbbbbbbd..',
      '.bbbbbbbbbbbbdd.',
      '.bbbbbbbbbbbbdd.',
      '.llllllllllll...',
    ];
    const g = gridFromRows(rows, { d: '#334455', b: '#667788', l: '#99aabb' });
    const fails = judgeSprite(measure(g), criteria);
    expect(fails.length).toBeGreaterThanOrEqual(3);
  });

  it('기준 집합 자신 가운데 다수는 합격한다', () => {
    const pass = ref.filter(r => judgeSprite(measure(r.grid), criteria).length === 0).length;
    expect(pass / ref.length).toBeGreaterThan(0.6);
  });

  it('모든 후보가 같은 아가미 모양이면 집합 판정에서 탈락한다', () => {
    const base = measure(ref[0].grid);
    const same = Array.from({ length: 16 }, () => ({ ...base, gill: 1 as const, eye: '2' }));
    expect(judgeSet(same, criteria).length).toBeGreaterThan(0);
  });
});
