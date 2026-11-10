/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEADER_TIER_CLASS } from '../../src/presentation/ui/hud/headerTier';
import { MOBILE_QUERY } from '../../src/presentation/layouts/useMobileLayout';
import { fmtCompact, fmtCompact3 } from '../../src/presentation/ui/format';
import { MAX_BOAT, boatNameOf, capOfBoat } from '../../src/game/rules/logic';
import { parseTierClass } from './judge';
import { TIER_FORMAT, breakpointPx, buildWidths, longestState, longestValue } from './targets';

const css = readFileSync('src/index.css', 'utf-8');
const sidebar = Number(/--sidebar-w:\s*(\d+)px/.exec(css)![1]);
const bounds = parseTierClass(HEADER_TIER_CLASS);

describe('가장 긴 값', () => {
  it('두 행 단계(유효숫자 세 자리)는 999,900보다 표기가 길거나 같은 값을 고른다', () => {
    const v = longestValue(fmtCompact3);
    expect(fmtCompact3(v).length).toBeGreaterThanOrEqual(fmtCompact3(999_900).length);
    expect(fmtCompact3(v)).toHaveLength(5);
  });
  it('기본과 간격 축소 단계는 그 단계의 포매터로 가장 긴 값을 고른다', () => {
    const v = longestValue(fmtCompact);
    expect(fmtCompact(v).length).toBeGreaterThanOrEqual(fmtCompact(999_900).length);
  });
  it('단계마다 쓰는 포매터가 정해져 있다', () => {
    expect(TIER_FORMAT).toEqual({ default: fmtCompact, tight: fmtCompact, 'two-row': fmtCompact3 });
  });
});

describe('최장 값 상태', () => {
  it('고른 골드와 명성, 최상위 배, 낚싯대 99, 가방 가득', () => {
    const s = longestState(99_900);
    expect(s.gold).toBe(99_900);
    expect(s.fame).toBe(99_900);
    expect(boatNameOf(s.boat)).toBe('대양 트롤선');
    expect(s.boat).toBe(MAX_BOAT);
    expect(s.rod).toBe(99);
    expect(s.bag).toHaveLength(capOfBoat(MAX_BOAT));
  });
});

describe('뷰포트 폭 목록', () => {
  const layoutBreak = breakpointPx(MOBILE_QUERY);
  const widths = buildWidths({ layoutBreak, bounds, sidebar });
  it('판정 경계는 48rem에서 768px이다', () => expect(layoutBreak).toBe(768));
  it('오름차순이고 모두 PC 레이아웃이다', () => {
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(new Set(widths).size).toBe(widths.length);
    expect(widths.every(w => w >= layoutBreak)).toBe(true);
  });
  it('판정 경계와 헤더 단계 경계의 바로 아래와 위, 지원 크기를 덮는다', () => {
    expect(widths).toContain(layoutBreak);
    for (const b of [bounds.tight, bounds.wide]) {
      expect(widths, `스테이지 ${b - 1}`).toContain(b - 1 + sidebar);
      expect(widths, `스테이지 ${b}`).toContain(b + sidebar);
    }
    expect(widths).toContain(1280);
    expect(widths).toContain(1920);
  });
  it('사이드바 폭이 달라지면 경계 폭이 따라 움직인다', () => {
    expect(buildWidths({ layoutBreak, bounds, sidebar: 400 })).toContain(bounds.wide + 400);
  });
});
