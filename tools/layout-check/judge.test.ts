import { describe, expect, it } from 'vitest';
import {
  expectedTier, findOverlaps, formatReport, judgeCase, observedTier, parseTierClass, rectsOverlap, summarize,
} from './judge';
import type { Measure, Rect } from './judge';

const BOUNDS = { tight: 640, wide: 772 };
const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

describe('parseTierClass', () => {
  it('단계 경계와 기본 칸 간격을 클래스 문자열에서 읽는다', () => {
    const cls = '[--hdr-gap:18px] @max-[772px]:[--hdr-gap:8px] @max-[640px]:[--hdr-inset:8px] @max-[772px]:[--hdr-pad:12px]';
    expect(parseTierClass(cls)).toEqual({ tight: 640, wide: 772, baseGap: 18 });
  });
  it('경계가 둘이 아니면 오류다', () => {
    expect(() => parseTierClass('[--hdr-gap:18px] @max-[772px]:[--hdr-gap:8px]')).toThrow();
  });
});

describe('expectedTier', () => {
  it.each([[772, 'default'], [771, 'tight'], [640, 'tight'], [639, 'two-row'], [1536, 'default']] as const)(
    '스테이지 폭 %i는 %s', (w, tier) => expect(expectedTier(w, BOUNDS)).toBe(tier));
});

describe('observedTier', () => {
  it('행 변수가 켜지면 두 행, 아니면 칸 간격이 기본과 같을 때 기본', () => {
    expect(observedTier({ rows: true, gap: 8 }, 18)).toBe('two-row');
    expect(observedTier({ rows: false, gap: 18 }, 18)).toBe('default');
    expect(observedTier({ rows: false, gap: 8 }, 18)).toBe('tight');
  });
});

describe('rectsOverlap', () => {
  it('넓이가 있는 교차만 겹침이다', () => {
    expect(rectsOverlap(r(0, 0, 10, 10), r(5, 5, 10, 10))).toBe(true);
    expect(rectsOverlap(r(0, 0, 10, 10), r(10, 0, 10, 10))).toBe(false);
    expect(rectsOverlap(r(0, 0, 10, 10), r(20, 20, 5, 5))).toBe(false);
  });
});

describe('findOverlaps', () => {
  it('겹친 쌍과 겹친 크기를 돌려준다', () => {
    const found = findOverlaps([
      { label: 'A', rect: r(0, 0, 10, 10) }, { label: 'B', rect: r(6, 4, 10, 10) }, { label: 'C', rect: r(100, 0, 5, 5) },
    ]);
    expect(found).toEqual([{ a: 'A', b: 'B', width: 4, height: 6 }]);
  });
});

/** 스테이지 772(기본 단계)에서 문제가 없는 측정값 */
const good = (): Measure => ({
  viewportWidth: 1156, stageWidth: 772,
  tier: { rows: false, gap: 18 }, inset: 12,
  stage: r(0, 0, 772, 800), sidebar: r(772, 0, 384, 800), bar: r(100, 12, 500, 60), menu: r(612, 12, 60, 60),
  clipped: [], clickables: [],
});
const ctx = { ...BOUNDS, baseGap: 18 };

describe('judgeCase', () => {
  it('문제가 없으면 모든 항목이 통과다', () => {
    const c = judgeCase(good(), ctx);
    expect(c.tier).toBe('default');
    expect(Object.values(c.checks).every(v => v.ok)).toBe(true);
    expect(c.observations).toEqual([]);
  });

  it('사이드바가 뷰포트 밖으로 나가면 위반이다', () => {
    const c = judgeCase({ ...good(), sidebar: r(800, 0, 384, 800) }, ctx);
    expect(c.checks.viewport.ok).toBe(false);
    expect(judgeCase({ ...good(), stage: r(-20, 0, 772, 800) }, ctx).checks.viewport.ok).toBe(false);
  });

  it('자원 바와 메뉴 버튼이 겹치면 위반이다', () => {
    const c = judgeCase({ ...good(), menu: r(590, 12, 60, 60) }, ctx);
    expect(c.checks.overlap.ok).toBe(false);
    expect(c.checks.gap.ok).toBe(false);
  });

  it('스테이지 밖으로 나가면 위반이다', () => {
    const c = judgeCase({ ...good(), menu: r(740, 12, 60, 60) }, ctx);
    expect(c.checks.inStage.ok).toBe(false);
  });

  it('간격이 바깥 여백보다 1px을 넘게 좁으면 위반, 1px 이내는 허용한다', () => {
    expect(judgeCase({ ...good(), menu: r(611, 12, 60, 60) }, ctx).checks.gap.ok).toBe(true);
    expect(judgeCase({ ...good(), menu: r(609, 12, 60, 60) }, ctx).checks.gap.ok).toBe(false);
  });

  it('세로 중심이 2px을 넘게 어긋나면 위반이다', () => {
    expect(judgeCase({ ...good(), menu: r(612, 14, 60, 60) }, ctx).checks.center.ok).toBe(true);
    expect(judgeCase({ ...good(), menu: r(612, 15, 60, 60) }, ctx).checks.center.ok).toBe(false);
  });

  it('잘린 글자가 있으면 위반이고 상세에 글자가 든다', () => {
    const c = judgeCase({ ...good(), clipped: [{ text: '999.9K', scrollWidth: 50, clientWidth: 40 }] }, ctx);
    expect(c.checks.clip.ok).toBe(false);
    expect(c.checks.clip.detail).toContain('999.9K');
  });

  it('스테이지 폭에 맞지 않는 단계는 위반이다 - 639에서 간격 축소', () => {
    const m: Measure = { ...good(), stageWidth: 639, stage: r(0, 0, 639, 800), tier: { rows: false, gap: 8 }, inset: 8 };
    const c = judgeCase(m, ctx);
    expect(c.tier).toBe('tight');
    expect(c.expectedTier).toBe('two-row');
    expect(c.checks.tier.ok).toBe(false);
  });


  it('누를 수 있는 요소끼리 겹친 것은 관측이고 위반이 아니다', () => {
    const m = { ...good(), clickables: [
      { label: '입력', rect: r(10, 700, 300, 40) }, { label: '칩', rect: r(200, 710, 100, 30) },
    ] };
    const c = judgeCase(m, ctx);
    expect(c.observations).toHaveLength(1);
    expect(Object.values(c.checks).every(v => v.ok)).toBe(true);
  });
});

describe('summarize', () => {
  it('위반 항목 수와 관측 수를 센다', () => {
    const ok = judgeCase(good(), ctx);
    const bad = judgeCase({ ...good(), sidebar: r(800, 0, 384, 800), menu: r(590, 12, 60, 60) }, ctx);
    expect(summarize([{ width: 1156, state: '초기', result: ok }]).violations).toBe(0);
    expect(summarize([{ width: 1156, state: '초기', result: ok }, { width: 900, state: '최장', result: bad }]).violations).toBe(3);
  });
});

describe('formatReport', () => {
  it('표에 폭, 상태, 항목별 결과를 쓰고 위반 상세를 붙인다', () => {
    const bad = judgeCase({ ...good(), sidebar: r(800, 0, 384, 800) }, ctx);
    const text = formatReport([{ width: 1156, state: '최장', result: bad }]);
    expect(text).toContain('1156');
    expect(text).toContain('위반 1건');
    expect(text).toContain('폭 1156 / 최장 / 뷰포트 안');
  });
});
