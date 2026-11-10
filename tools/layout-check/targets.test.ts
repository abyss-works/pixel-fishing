/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEADER_TIER_CLASS } from '../../src/presentation/ui/hud/headerTier';
import { MOBILE_QUERY } from '../../src/presentation/layouts/useMobileLayout';
import { MAX_BOAT, boatNameOf, capOfBoat } from '../../src/game/rules/logic';
import { parseTierClass } from './judge';
import { VIEWPORT_WIDTHS, longestState } from './targets';

const css = readFileSync('src/index.css', 'utf-8');
const sidebar = Number(/--sidebar-w:\s*(\d+)px/.exec(css)![1]);
const layoutBreak = Number(/\(width < ([\d.]+)rem\)/.exec(MOBILE_QUERY)![1]) * 16;
const bounds = parseTierClass(HEADER_TIER_CLASS);

describe('최장 값 상태', () => {
  it('골드와 명성 999,900 이상, 최상위 배, 낚싯대 99, 가방 가득', () => {
    const s = longestState();
    expect(s.gold).toBeGreaterThanOrEqual(999_900);
    expect(s.fame).toBeGreaterThanOrEqual(999_900);
    expect(boatNameOf(s.boat)).toBe('대양 트롤선');
    expect(s.boat).toBe(MAX_BOAT);
    expect(s.rod).toBe(99);
    expect(s.bag).toHaveLength(capOfBoat(MAX_BOAT));
  });
});

describe('뷰포트 폭 목록', () => {
  it('모두 PC 레이아웃이고 판정 경계가 목록에 있다', () => {
    expect(VIEWPORT_WIDTHS.every(w => w >= layoutBreak)).toBe(true);
    expect(VIEWPORT_WIDTHS).toContain(layoutBreak);
  });
  it('헤더 단계 경계의 바로 아래와 위(스테이지 폭 기준)를 모두 덮는다', () => {
    for (const b of [bounds.tight, bounds.wide]) {
      expect(VIEWPORT_WIDTHS, `스테이지 ${b - 1}`).toContain(b - 1 + sidebar);
      expect(VIEWPORT_WIDTHS, `스테이지 ${b}`).toContain(b + sidebar);
    }
  });
});
