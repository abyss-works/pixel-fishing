import { afterEach, describe, expect, it } from 'vitest';
import { ROD, upgradeCost } from '../../src/game/rules/balance';
import { IDLE_BOOST_STEPS, relativeIdleBoost as productIdleBoost } from '../../src/game/rules/power';
import { minLevelOfPower as productMinLevel, powerOfLevel as productPower } from '../../src/game/rules/stats';
import { SPOTS } from '../../src/game/content/spots';
import { rodStats } from '../../src/game/rules/logic';
import { applyRodRules, biteRangeOf, minLevelOfPower, parseRodRules, powerOfLevel, relativeIdleBoost } from './rodRules';
import { rodSpec } from './model';

describe('낚싯대 규칙 — 제품 공개 함수와 같은 결과', () => {
  it('기본값에서 레벨별 파워와 파워의 최소 레벨이 제품 함수와 같다', () => {
    for (let lv = 1; lv <= 80; lv++) expect(powerOfLevel(lv)).toBe(productPower(lv));
    for (let p = 0; p <= 420; p++) expect(minLevelOfPower(p)).toBe(productMinLevel(p));
  });

  it('기본값에서 방치 배수가 모든 해역과 파워에서 제품 함수와 같다', () => {
    for (const s of SPOTS) {
      for (let p = 0; p <= 260; p += 1) expect(relativeIdleBoost(p, s.id)).toBe(productIdleBoost(p, s.id));
    }
  });
});

describe('입질 대기 감소 방식', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; });

  it('기본(both)은 모든 레벨에서 제품 함수와 같다', () => {
    for (let lv = 1; lv <= 80; lv++) {
      const st = rodStats(lv), r = biteRangeOf(lv);
      expect(r.biteMin).toBe(st.biteMin);
      expect(r.biteMax).toBe(st.biteMax);
    }
  });

  it('alternate는 최대치만 올림 절반 횟수, 최소치만 내림 절반 횟수 감쇠를 곱한다(레벨 1에서 6)', () => {
    restore = applyRodRules({ biteDecayMode: 'alternate' });
    const d = ROD.biteDecay;
    const expected = [
      [ROD.biteMin, ROD.biteMax],
      [ROD.biteMin, ROD.biteMax * d],
      [ROD.biteMin * d, ROD.biteMax * d],
      [ROD.biteMin * d, ROD.biteMax * d ** 2],
      [ROD.biteMin * d ** 2, ROD.biteMax * d ** 2],
      [ROD.biteMin * d ** 2, ROD.biteMax * d ** 3],
    ];
    expected.forEach(([min, max], i) => {
      const r = biteRangeOf(i + 1);
      expect(r.biteMin).toBeCloseTo(min, 12);
      expect(r.biteMax).toBeCloseTo(max, 12);
    });
    // 측정 모델의 낚싯대 스펙도 같은 값을 쓴다
    expect(rodSpec('sea', 4).biteMax).toBeCloseTo(ROD.biteMax * d ** 2, 12);
    expect(rodSpec('sea', 4).biteMin).toBeCloseTo(ROD.biteMin * d, 12);
  });

  it('감쇠 값을 바꾸면 alternate에도 따라가고 복원하면 제품 값으로 돌아간다', () => {
    restore = applyRodRules({ biteDecayMode: 'alternate', biteDecay: 0.9 });
    expect(biteRangeOf(3).biteMax).toBeCloseTo(ROD.biteMax * 0.9, 12);
    restore();
    restore = null;
    expect(biteRangeOf(3).biteMax).toBe(rodStats(3).biteMax);
    expect(rodSpec('sea', 3).biteMax).toBe(rodStats(3).biteMax);
  });

  it('방식은 both 또는 alternate만 받는다', () => {
    expect(parseRodRules({ biteDecayMode: 'alternate' })).toEqual({ biteDecayMode: 'alternate' });
    expect(() => parseRodRules({ biteDecayMode: 'min' })).toThrow('biteDecayMode');
  });
});

describe('낚싯대 규칙 덮어쓰기', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; });

  it('레벨당 파워를 바꾸면 파워와 최소 레벨이 따라가고 복원하면 제품 값으로 돌아간다', () => {
    restore = applyRodRules({ powerPerLevel: 2.5 });
    expect(powerOfLevel(1)).toBe(productPower(1));
    expect(powerOfLevel(5)).toBe(20);
    expect(minLevelOfPower(30)).toBe(9);
    restore();
    restore = null;
    expect(powerOfLevel(5)).toBe(productPower(5));
    expect(minLevelOfPower(30)).toBe(productMinLevel(30));
  });

  it('강화비 계수와 입질 감쇠는 제품 함수가 읽는 상수를 바꾼다', () => {
    const cost = upgradeCost(20), decay = rodStats(10).biteMin, grow = ROD.costGrowth;
    restore = applyRodRules({ costGrowth: 1.5, costPowerFrom: 12, costPowerExp: 6, costBase: 40, biteDecay: 0.97 });
    expect(upgradeCost(5)).toBe(Math.round(40 * 1.5 ** 4));
    expect(upgradeCost(20)).toBe(Math.round(40 * 1.5 ** 11 * (20 / 12) ** 6));
    expect(rodStats(10).biteMin).toBeCloseTo(ROD.biteMin * 0.97 ** 9, 10);
    restore();
    restore = null;
    expect(upgradeCost(20)).toBe(cost);
    expect(rodStats(10).biteMin).toBe(decay);
    expect(ROD.costGrowth).toBe(grow);
  });

  it('방치 배수 표를 바꾸고, 레벨 차 기준은 새 레벨당 파워로, 파워 초과 기준은 주어진 단위로 센다', () => {
    const base = [...IDLE_BOOST_STEPS];
    restore = applyRodRules({ powerPerLevel: 2.5, idleBoost: { world: [9, 8, 7, 6, 5], basis: 'level' } });
    // 레벨 차 기준: 파워 초과 5는 2레벨 차
    expect(relativeIdleBoost(105 + 5, 'mozstrait')).toBe(7);
    restore();
    restore = applyRodRules({ powerPerLevel: 2.5, idleBoost: { world: [9, 8, 7, 6, 5], basis: 'power', unit: 5 } });
    expect(relativeIdleBoost(105 + 5, 'mozstrait')).toBe(8);
    expect(relativeIdleBoost(105 + 100, 'mozstrait')).toBe(5);
    restore();
    restore = null;
    expect([...IDLE_BOOST_STEPS]).toEqual(base);
  });

  it('파워 초과 기준의 단위를 생략하면 제품의 레벨당 파워(덮어쓰기 전)다', () => {
    restore = applyRodRules({ powerPerLevel: 2.5, idleBoost: { basis: 'power' } });
    expect(relativeIdleBoost(105 + 5, 'mozstrait')).toBe(productIdleBoost(105 + 5, 'mozstrait'));
  });
});

describe('낚싯대 규칙 입력 검사', () => {
  it('알 수 없는 키, 숫자가 아닌 값, 0 이하 레벨당 파워, 표 길이 0을 거부한다', () => {
    expect(() => parseRodRules({ nope: 1 })).toThrow('알 수 없는 키');
    expect(() => parseRodRules({ costGrowth: '1.5' })).toThrow('숫자');
    expect(() => parseRodRules({ powerPerLevel: 0 })).toThrow('0보다');
    expect(() => parseRodRules({ biteDecay: 1.2 })).toThrow('biteDecay');
    expect(() => parseRodRules({ idleBoost: { world: [] } })).toThrow('비어');
    expect(() => parseRodRules({ idleBoost: { basis: 'x' } })).toThrow('basis');
    expect(() => parseRodRules({ idleBoost: { world: [1, 'a'] } })).toThrow('숫자');
    expect(() => parseRodRules({ idleBoost: { village: [1, 2] } })).toThrow('알 수 없는 키');
  });

  it('올바른 입력은 그대로 돌려준다', () => {
    expect(parseRodRules({ powerPerLevel: 2.5, idleBoost: { basis: 'power', unit: 5, world: [5, 4] } }))
      .toEqual({ powerPerLevel: 2.5, idleBoost: { basis: 'power', unit: 5, world: [5, 4] } });
  });
});
