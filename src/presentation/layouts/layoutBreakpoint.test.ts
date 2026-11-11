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

describe('레이아웃 판정 기준(뷰포트 폭 768px)', () => {
  it('정본은 768px(48rem)이고 Tailwind md와 같다', () => {
    expect(canonicalPx()).toBe(768);
    expect(css).not.toMatch(/--breakpoint-md\s*:/);
  });

  it('JS 판정(MOBILE_QUERY)이 정본과 같은 값이다', () => {
    expect(MOBILE_QUERY).toBe('(width < 48rem)');
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

  it('경계: 767은 모바일 레이아웃, 768은 PC 레이아웃이다', () => {
    expect(evaluate(MOBILE_QUERY, 360)).toBe(true);
    expect(evaluate(MOBILE_QUERY, 767)).toBe(true);
    expect(evaluate(MOBILE_QUERY, 768)).toBe(false);
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

  it('레이아웃 경계를 1024px 리터럴이나 lg: 변형으로 적지 않는다 - 정본(--breakpoint-pc)만 쓴다', () => {
    const offenders: string[] = [];
    for (const [key, src] of sources) {
      if (key.includes('/views/admin/')) continue; // 관리자 대시보드는 열 수 밀도만 정한다
      src.split('\n').forEach((line, i) => {
        if (/(^|[^\w-])(?:max-)?lg:/.test(line) || /1024|64rem/.test(line)) offenders.push(`${key}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
    expect(css).not.toMatch(/1024px|64rem/);
  });

  it('PC 헤더 구성요소는 단계 경계를 모른다 - 스테이지 폭 변형은 단계 파일(headerTier)에만 있다', () => {
    const pcHeader = ['ResourceBar', 'BagMeter', 'HudStat', 'HeaderFrame', 'HudMenuButton']
      .map(name => sources.find(([key]) => key.endsWith(`/ui/hud/${name}.tsx`)));
    for (const entry of pcHeader) expect(entry, '소스를 찾지 못했다').toBeDefined();
    for (const [key, src] of pcHeader as [string, string][]) {
      const code = src.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
      expect(code, key).not.toMatch(/@max-\[/);
      expect(code, key).not.toMatch(/\bmobile:/);
    }
  });

  it('헤더 단계 경계(772px, 640px)는 한 곳(headerTier)에서만 정의한다', () => {
    const tier = sources.find(([key]) => key.endsWith('/ui/hud/headerTier.ts'));
    expect(tier, '단계 파일을 찾지 못했다').toBeDefined();
    expect(tier![1]).toMatch(/@max-\[772px\]/);
    expect(tier![1]).toMatch(/@max-\[640px\]/);
    const offenders: string[] = [];
    for (const [key, src] of sources) {
      if (key.endsWith('/ui/hud/headerTier.ts')) continue;
      src.split('\n').forEach((line, i) => {
        if (/(?:max|min)-\[(?:772|640)px\]/.test(line)) offenders.push(`${key}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('쌓기 단계 경계(464px)는 한 곳(stackTier)에서만 정의하고, 그 클래스는 모두 PC 레이아웃 접두사(pc:)를 단다', () => {
    const tier = sources.find(([key]) => key.endsWith('/ui/hud/stackTier.ts'));
    expect(tier, '단계 파일을 찾지 못했다').toBeDefined();
    const classes = tier![1].match(/[\w:[\]()@%.,/-]*@max-\[464px\][^\s']*/g) ?? [];
    expect(classes.length).toBeGreaterThan(0);
    for (const c of classes) expect(c.startsWith('pc:@max-[464px]:'), c).toBe(true);
    const offenders: string[] = [];
    for (const [key, src] of sources) {
      if (key.endsWith('/ui/hud/stackTier.ts')) continue;
      src.split('\n').forEach((line, n) => {
        if (/(?:max|min)-\[464px\]/.test(line)) offenders.push(`${key}:${n + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('쌓기 단계 클래스와 헤더 두 행 단계 생략 클래스는 상수로만 쓴다 - 화면 컴포넌트가 가져다 쓴다', () => {
    const used = (suffix: string, name: string) => {
      const entry = sources.find(([key]) => key.endsWith(suffix));
      expect(entry, `${suffix} 소스를 찾지 못했다`).toBeDefined();
      expect(entry![1], suffix).toContain(name);
    };
    used('/hud/HudLayout.tsx', 'STACK_TRUNK_CLASS');
    used('/hud/HudLayout.tsx', 'STACK_COLUMN_CLASS');
    used('/ui/hud/MessageLog.tsx', 'STACK_LOG_CLASS');
    used('/game-stage/GameFrame.tsx', 'STACK_FRAME_FILL_CLASS');
    used('/views/game/base-menu/BaseMenu.tsx', 'STACK_MENU_CLASS');
    used('/ui/hud/HudRows.tsx', 'STACK_OMIT_CLASS');
    used('/views/overlays/away/AwayCard.tsx', 'STACK_OMIT_CLASS');
    used('/views/overlays/bounty/TraceCard.tsx', 'STACK_OMIT_CLASS');
    used('/game-stage/Field.tsx', 'HEADER_ROWS_OMIT_CLASS');
  });
});
