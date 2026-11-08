/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOBILE_QUERY } from './useMobileLayout';

// 레이아웃 판정 기준 - 모바일 레이아웃과 PC 레이아웃은 뷰포트 폭 하나로 가른다. CSS 변형, CSS 규칙, JS 판정이 같은 정본 값에서 나온다.
const css = readFileSync('src/index.css', 'utf-8');
/** 화면 컴포넌트 소스(테스트 제외) - 경로 -> 본문 */
const sources = Object.entries(import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
  .filter(([key]) => !/\.test\.tsx?$/.test(key));
const REM_PX = 16;

/** 정본 값(--breakpoint-pc)을 px로 읽는다 */
function canonicalPx(): number {
  const rem = /--breakpoint-pc:\s*([\d.]+)rem/.exec(css);
  expect(rem, 'index.css의 @theme에 --breakpoint-pc(rem)가 있어야 한다').not.toBeNull();
  return Number(rem![1]) * REM_PX;
}

/** "(width < Nrem)" 질의를 뷰포트 폭으로 평가한다 */
function evaluate(query: string, viewportPx: number): boolean {
  const m = /^\(width < ([\d.]+)rem\)$/.exec(query);
  expect(m, `예상한 형식이 아니다: ${query}`).not.toBeNull();
  return viewportPx < Number(m![1]) * REM_PX;
}

describe('레이아웃 판정 기준(뷰포트 폭 1024px)', () => {
  it('정본은 1024px(64rem)다', () => {
    expect(canonicalPx()).toBe(1024);
  });

  it('JS 판정(MOBILE_QUERY)이 정본과 같은 값이다', () => {
    expect(MOBILE_QUERY).toBe('(width < 64rem)');
    expect(MOBILE_QUERY).toBe(`(width < ${canonicalPx() / REM_PX}rem)`);
  });

  it('CSS의 mobile 변형과 입력 칸 규칙이 정본을 참조한다 - 같은 값을 따로 적지 않는다', () => {
    expect(css).toMatch(/@custom-variant mobile \(@media \(width < theme\(--breakpoint-pc\)\)\);/);
    expect(css).toMatch(/@media \(width < theme\(--breakpoint-pc\)\) \{\s*html \{ touch-action/);
    // 입력 칸 16px 규칙도 같은 media 블록 안에 있다
    const block = /@media \(width < theme\(--breakpoint-pc\)\) \{\s*html \{ touch-action[\s\S]*?\n\}/.exec(css);
    expect(block, '정본 media 블록을 찾지 못했다').not.toBeNull();
    expect(block![0]).toMatch(/font-size:\s*16px/);
  });

  it('방향 조건과 옛 600px 기준을 쓰지 않는다', () => {
    expect(css).not.toMatch(/orientation:/);
    expect(css).not.toMatch(/max-width:\s*599px/);
    expect(MOBILE_QUERY).not.toContain('orientation');
  });

  it('경계: 1023은 모바일 레이아웃, 1024는 PC 레이아웃이다', () => {
    expect(evaluate(MOBILE_QUERY, 360)).toBe(true);
    expect(evaluate(MOBILE_QUERY, 1023)).toBe(true);
    expect(evaluate(MOBILE_QUERY, 1024)).toBe(false);
    expect(evaluate(MOBILE_QUERY, 1280)).toBe(false);
    expect(evaluate(MOBILE_QUERY, 1920)).toBe(false);
  });

  it('뷰포트 폭 임의 값(max-[Npx], min-[Npx])으로 레이아웃을 가르지 않는다 - 모바일 레이아웃은 mobile: 변형 하나다', () => {
    const offenders: string[] = [];
    for (const [key, src] of sources) {
      src.split('\n').forEach((line, i) => {
        if (/(^|[^@\w-])(?:max|min)-\[\d+px\]:/.test(line)) offenders.push(`${key}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('PC 헤더 구성요소에는 스테이지 폭 변형(@max-, @min-)과 모바일 변형(mobile:)이 없다 - PC 헤더는 늘 같은 크기다', () => {
    const pcHeader = ['ResourceBar', 'BagMeter', 'HudStat', 'HeaderFrame', 'HudMenuButton']
      .map(name => sources.find(([key]) => key.endsWith(`/ui/hud/${name}.tsx`)));
    for (const entry of pcHeader) expect(entry, '소스를 찾지 못했다').toBeDefined();
    for (const [key, src] of pcHeader as [string, string][]) {
      const code = src.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
      expect(code, key).not.toMatch(/@(?:max|min)-\[/);
      expect(code, key).not.toMatch(/\bmobile:/);
    }
  });
});
