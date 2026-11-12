import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import { RARITY_ORDER } from '../../../src/game/content/rarity';
import { BAIT_EFFECTS, BAIT_WINDOW_MIN, LUNCH_HOURS, RECIPES, bagSupplyRows, parseCostSpec, recipeRows, recipesCovered, windowRows, withCostOverrides } from './cooking';
import { DEFAULT_SEED } from './dist';
import { NO_EFFECT, effectRates } from './effects';
import { axisOf } from './progress';
import { parseArgs, runCli } from './report';

const bait = RECIPES.find(r => r.id === 'cook-bait-epic')!;
const lunch = RECIPES.find(r => r.id === 'cook-lunch-bite')!;
const bag = { axis: 'idle', margin: 0, hours: 9, trials: 3, seed: 7 } as const;
const grades = (r: Record<string, number>) => RARITY_ORDER.reduce((a, g) => a + r[g], 0);

describe('레시피 기운 수량 덮어쓰기', () => {
  it('덮어쓴 수량이 레시피의 기운 요구를 통째로 바꾸고 콘텐츠 레시피는 그대로다', () => {
    const before = JSON.stringify(RECIPES);
    const [o] = withCostOverrides([bait], { 'cook-bait-epic': { common: 50, epic: 4 } });
    expect(o.cost).toEqual({ common: 50, epic: 4 });
    expect(o.effect).toEqual(bait.effect);
    expect(JSON.stringify(RECIPES)).toBe(before);
  });

  it('덮어쓰기가 없으면 같은 레시피를 돌려준다', () => {
    expect(withCostOverrides(RECIPES, {})).toEqual(RECIPES);
  });

  it('덮어쓴 레시피만 바뀌고 나머지는 같다', () => {
    const out = withCostOverrides(RECIPES, { [lunch.id]: { common: 1 } });
    expect(out.find(r => r.id === lunch.id)!.cost).toEqual({ common: 1 });
    expect(out.filter(r => r.id !== lunch.id)).toEqual(RECIPES.filter(r => r.id !== lunch.id));
  });

  it('순손익과 모으는 시간, 조리 가능 수가 바뀐다', () => {
    const cheap = withCostOverrides([bait], { [bait.id]: { common: 1 } });
    const dear = withCostOverrides([bait], { [bait.id]: { common: 50, epic: 4 } });
    const a = recipeRows({ axis: 'idle', margin: 0, recipes: cheap }), b = recipeRows({ axis: 'idle', margin: 0, recipes: dear });
    expect(a.map(r => r.spot)).toEqual(b.map(r => r.spot));
    for (let k = 0; k < a.length; k++) {
      expect(a[k].gain).toBe(b[k].gain);
      if (a[k].net !== null) expect(b[k].net === null || b[k].net! < a[k].net!).toBe(true);
    }
    expect(a.some((r, k) => r.loss !== b[k].loss)).toBe(true);
    const supply = { common: 40, rare: 10, epic: 6, legendary: 0 };
    expect(recipesCovered(supply, cheap[0])).toBe(40);
    expect(recipesCovered(supply, dear[0])).toBeCloseTo(0.8);
  });

  it('잘못된 레시피 id, 등급, 수량은 오류다', () => {
    expect(() => withCostOverrides(RECIPES, { nope: { common: 1 } })).toThrow(/레시피/);
    expect(() => withCostOverrides(RECIPES, { [bait.id]: { mythic: 1 } as never })).toThrow(/등급/);
    expect(() => withCostOverrides(RECIPES, { [bait.id]: { common: -1 } })).toThrow(/수량/);
    expect(() => withCostOverrides(RECIPES, { [bait.id]: { common: 0.25 } })).toThrow(/수량/);
    expect(() => withCostOverrides(RECIPES, { [bait.id]: { common: 1.05 } })).toThrow(/수량/);
    expect(() => withCostOverrides(RECIPES, { [bait.id]: { common: Number.NaN } })).toThrow(/수량/);
    expect(() => withCostOverrides(RECIPES, { [bait.id]: { common: 0 } })).toThrow(/수량/);
    expect(() => withCostOverrides(RECIPES, { [bait.id]: {} })).toThrow(/수량/);
  });

  it('소수 첫째 자리까지의 수량을 덮어쓸 수 있고, 덮어쓴 요구로 만들 수 있는 개수를 센다', () => {
    const [o] = withCostOverrides([bait], { [bait.id]: { common: 0.5, epic: 1.5 } });
    expect(o.cost).toEqual({ common: 0.5, epic: 1.5 });
    expect(recipesCovered({ common: 3, rare: 0, epic: 3, legendary: 0 }, o)).toBe(2);
    expect(recipesCovered({ common: 3, rare: 0, epic: 30, legendary: 0 }, o)).toBe(6);
  });

  it('명령줄 형식을 id와 등급별 수량으로 읽고 형식이 틀리면 오류다', () => {
    expect(parseCostSpec('cook-bait-epic=common:50,epic:4')).toEqual({ id: 'cook-bait-epic', cost: { common: 50, epic: 4 } });
    for (const bad of ['', 'cook-bait-epic', 'cook-bait-epic=', 'cook-bait-epic=common', 'cook-bait-epic=common:x', 'cook-bait-epic=common:-1', 'cook-bait-epic=common:1.25', 'cook-bait-epic=common:.5', 'cook-bait-epic=common:1.', 'cook-bait-epic=common:1e1', '=common:1', 'cook-bait-epic=common:1,common:2']) {
      expect(() => parseCostSpec(bad), bad).toThrow(/--cost/);
    }
    expect(() => parseCostSpec('cook-bait-epic=mythic:1')).toThrow(/등급/);
  });

  it('명령줄의 수량은 소수 첫째 자리까지 읽는다', () => {
    expect(parseCostSpec('cook-bait-epic=common:0.5,epic:1.5')).toEqual({ id: 'cook-bait-epic', cost: { common: 0.5, epic: 1.5 } });
    expect(parseCostSpec('cook-bait-epic=common:2.0')).toEqual({ id: 'cook-bait-epic', cost: { common: 2 } });
  });
});

describe('집 기운 얻기 공급 옵션', () => {
  it('옵션이 없으면 방문 간격 = 낚는 시간, 수동 비율 0(방치 기준)과 같은 결과다', () => {
    const base = bagSupplyRows(bag);
    expect(bagSupplyRows({ ...bag, visitHours: 9 })).toEqual(base);
    expect(bagSupplyRows({ ...bag, manualShare: 0 })).toEqual(base);
    expect(bagSupplyRows({ ...bag, visitHours: 100 })).toEqual(base);
  });

  it('수동 비율 1은 수동 낚시 공급과 같고 비율에 따라 낚은 수가 두 방식 사이에서 정해진다', () => {
    expect(bagSupplyRows({ ...bag, manualShare: 1 })).toEqual(bagSupplyRows({ ...bag, axis: 'manual' }));
    const idle = bagSupplyRows(bag), manual = bagSupplyRows({ ...bag, manualShare: 1 }), half = bagSupplyRows({ ...bag, manualShare: 0.5 });
    expect(half.length).toBe(idle.length);
    expect(half.some((r, k) => r.catches !== idle[k].catches)).toBe(true);
    for (let k = 0; k < half.length; k++) {
      const lo = Math.min(idle[k].catches, manual[k].catches) - 1, hi = Math.max(idle[k].catches, manual[k].catches) + 1;
      expect(half[k].catches).toBeGreaterThanOrEqual(lo);
      expect(half[k].catches).toBeLessThanOrEqual(hi);
    }
  });

  it('집에 자주 들르면 놓아주는 개체가 없고 기운이 늘어난다', () => {
    const long = bagSupplyRows({ ...bag, hours: 30 });
    expect(long.some(r => grades(r.released) > 0)).toBe(true);
    const short = bagSupplyRows({ ...bag, hours: 30, visitHours: 0.25 });
    for (const r of short) expect(grades(r.released)).toBe(0);
    const keptLong = long.reduce((a, r) => a + grades(r.kept), 0), keptShort = short.reduce((a, r) => a + grades(r.kept), 0);
    expect(keptShort).toBeGreaterThan(keptLong);
    for (const r of short) expect(grades(r.kept)).toBeCloseTo(r.catches, 5);
  });

  it('방문 구간 합이 낚은 수이고 같은 시드면 같다', () => {
    const a = bagSupplyRows({ ...bag, hours: 10, visitHours: 3, manualShare: 0.4 });
    expect(a).toEqual(bagSupplyRows({ ...bag, hours: 10, visitHours: 3, manualShare: 0.4 }));
    for (const r of a) expect(grades(r.kept) + grades(r.released)).toBeCloseTo(r.catches, 5);
  });

  it('구간이 많아도 낚은 수는 시간당 캐치 수 x 시간과 반올림 1 이내로 맞는다', () => {
    const rows = bagSupplyRows({ ...bag, hours: 9, visitHours: 0.25, manualShare: 0.01 });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const per = (axis: 'idle' | 'manual') => effectRates(r.spot, r.level, axisOf(axis, r.spot, r.level), NO_EFFECT).catchesPerHour;
      expect(Math.abs(r.catches - 9 * (0.99 * per('idle') + 0.01 * per('manual')))).toBeLessThanOrEqual(1);
    }
    const plain = bagSupplyRows({ ...bag, hours: 9, visitHours: 0.25 });
    for (const r of plain) expect(Math.abs(r.catches - 9 * effectRates(r.spot, r.level, axisOf('idle', r.spot, r.level), NO_EFFECT).catchesPerHour)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('잘못된 수동 비율과 방문 간격은 오류다', () => {
    for (const m of [-0.1, 1.1, Number.NaN]) expect(() => bagSupplyRows({ ...bag, manualShare: m })).toThrow(/수동 비율/);
    for (const v of [0, -1, 0.1, Number.NaN]) expect(() => bagSupplyRows({ ...bag, visitHours: v })).toThrow(/방문 간격/);
  });
});

describe('명령줄 옵션', () => {
  it('--cost는 여러 번 줄 수 있고 recipes, window에서만 쓴다', () => {
    const o = parseArgs(['recipes', '--cost', 'cook-bait-epic=common:50,epic:4', '--cost', 'cook-lunch-bite=common:3']);
    expect(o.cost).toEqual({ 'cook-bait-epic': { common: 50, epic: 4 }, 'cook-lunch-bite': { common: 3 } });
    expect(parseArgs(['window', '--recipe', 'cook-bait-epic', '--cost', 'cook-bait-epic=common:5']).cost).toEqual({ 'cook-bait-epic': { common: 5 } });
    expect(() => parseArgs(['effects', '--cost', 'cook-bait-epic=common:5'])).toThrow(/명령에서만/);
    expect(() => parseArgs(['recipes', '--cost', 'nope=common:5'])).toThrow(/레시피/);
    expect(() => parseArgs(['recipes', '--cost', 'cook-bait-epic=mythic:5'])).toThrow(/등급/);
    expect(() => parseArgs(['recipes', '--cost', 'cook-bait-epic=common:5', '--cost', 'cook-bait-epic=epic:1'])).toThrow(/두 번/);
    expect(() => parseArgs(['window', '--bait', 'epic', '--cost', 'cook-lunch-bite=common:5'])).toThrow(/--recipe/);
    expect(() => parseArgs(['recipes', '--recipe', 'cook-lunch-bite', '--cost', 'cook-bait-epic=common:5'])).toThrow(/--recipe/);
  });

  it('--manual-share, --visit-hours, --rod-offset은 recipes에서만 쓰고 범위를 검사한다', () => {
    const o = parseArgs(['recipes', '--manual-share', '0.5', '--visit-hours', '2', '--rod-offset', '-3']);
    expect(o).toMatchObject({ manualShare: 0.5, visitHours: 2, rodOffset: -3 });
    expect(parseArgs(['recipes'])).toMatchObject({ manualShare: null, visitHours: null, rodOffset: null, cost: {} });
    expect(() => parseArgs(['window', '--manual-share', '0.5'])).toThrow(/명령에서만/);
    expect(() => parseArgs(['recipes', '--manual-share', '1.5'])).toThrow(/0 이상 1 이하/);
    expect(() => parseArgs(['recipes', '--visit-hours', '0'])).toThrow(/0.25/);
    expect(() => parseArgs(['recipes', '--visit-hours', '0.1'])).toThrow(/0.25/);
    expect(() => parseArgs(['recipes', '--rod-offset', '-5'])).toThrow(/-4 이상/);
    expect(() => parseArgs(['recipes', '--rod-offset', '1.5'])).toThrow(/정수/);
  });

  it('recipes에 --cost를 주면 표와 조리 가능 수가 덮어쓴 수량으로 바뀐다', () => {
    const base = runCli(['recipes', '--recipe', 'cook-bait-epic', '--trials', '2']);
    const over = runCli(['recipes', '--recipe', 'cook-bait-epic', '--trials', '2', '--cost', 'cook-bait-epic=common:50,epic:4']);
    expect(over.exitCode).toBe(0);
    expect(over.stdout).not.toBe(base.stdout);
    expect(over.stdout).toContain('일반 50, 영웅 4');
    const json = JSON.parse(runCli(['recipes', '--recipe', 'cook-bait-epic', '--trials', '2', '--cost', 'cook-bait-epic=common:50,epic:4', '--json']).stdout);
    expect(json.recipes.costOverrides).toEqual({ 'cook-bait-epic': { common: 50, epic: 4 } });
  });

  it('옵션이 없으면 결과가 직접 계산한 값과 같고 새 항목이 없다', () => {
    const json = JSON.parse(runCli(['recipes', '--trials', '2', '--json']).stdout);
    const direct = { axis: 'idle', margin: 0, hours: LUNCH_HOURS, trials: 2, seed: DEFAULT_SEED, rows: recipeRows({ axis: 'idle', margin: 0 }), bag: bagSupplyRows({ axis: 'idle', margin: 0, hours: LUNCH_HOURS, trials: 2, seed: DEFAULT_SEED }) };
    expect(json.recipes).toEqual(JSON.parse(JSON.stringify(direct)));
    const w = JSON.parse(runCli(['window', '--bait', 'epic', '--trials', '2', '--json']).stdout).window;
    const wd = { effect: BAIT_EFFECTS.epic, minutes: BAIT_WINDOW_MIN, margin: 0, trials: 2, seed: DEFAULT_SEED, rows: windowRows({ axis: 'manual', effect: BAIT_EFFECTS.epic, margin: 0, minutes: BAIT_WINDOW_MIN, trials: 2, seed: DEFAULT_SEED }) };
    expect(w).toEqual(JSON.parse(JSON.stringify(wd)));
    const text = runCli(['window', '--bait', 'epic', '--trials', '2']).stdout;
    expect(text).toContain('등급 미끼의 제작 비용(기운)과 사람의 판정 실력은 넣지 않는다');
    expect(text).not.toContain('재료 비용');
  });

  it('window의 재료 비용 순손익은 같은 입력의 recipes 순손익과 같다', () => {
    const cost = 'cook-bait-epic=common:50,epic:4';
    for (const extra of [[], ['--axis', 'manual']]) {
      const w = JSON.parse(runCli(['window', '--recipe', 'cook-bait-epic', '--cost', cost, '--trials', '1', '--json', ...extra]).stdout).window.material;
      const r = JSON.parse(runCli(['recipes', '--recipe', 'cook-bait-epic', '--cost', cost, '--trials', '1', '--json', ...extra]).stdout).recipes;
      expect(w.axis).toBe(extra.length ? 'manual' : 'idle');
      expect(w.rows.map((x: { spot: string; net: number | null; loss: number; gain: number; collectHours: number | null }) => [x.spot, x.net, x.loss, x.gain, x.collectHours]))
        .toEqual(r.rows.map((x: { spot: string; net: number | null; loss: number; gain: number; collectHours: number | null }) => [x.spot, x.net, x.loss, x.gain, x.collectHours]));
    }
    const text = runCli(['window', '--recipe', 'cook-bait-epic', '--cost', cost, '--trials', '1']).stdout;
    expect(text).toContain('방치');
    expect(text).toContain('recipes와 같은 기준');
    expect(text).not.toContain('등급 미끼의 제작 비용(기운)과 사람의 판정 실력은 넣지 않는다');
  });

  it('--manual-share와 --axis를 함께 주면 공급은 비율을 따르고 출력에 밝힌다', () => {
    const text = runCli(['recipes', '--recipe', 'cook-bait-epic', '--trials', '1', '--axis', 'manual', '--manual-share', '0.5']).stdout;
    expect(text).toContain('공급의 낚시 방식은 --axis가 아니라 이 비율로 정하고');
  });

  it('--cost의 레시피 id가 객체 기본 속성 이름이어도 중복이 아니라 없는 레시피다', () => {
    expect(() => parseArgs(['recipes', '--cost', 'constructor=common:1'])).toThrow(/알 수 없는 레시피/);
  });

  it('--rod-offset은 공급 표의 낚싯대만 바꾸고 순손익 표는 --margin을 따른다', () => {
    const base = JSON.parse(runCli(['recipes', '--trials', '2', '--json']).stdout).recipes;
    const off = JSON.parse(runCli(['recipes', '--trials', '2', '--rod-offset', '2', '--json']).stdout).recipes;
    expect(off.rows).toEqual(base.rows);
    expect(off.bag.length).toBe(base.bag.length);
    off.bag.forEach((r: { level: number; spot: string }, k: number) => expect(r.level).toBe(base.bag[k].level + 2));
    expect(off.rodOffset).toBe(2);
  });

  it('window에 --recipe와 --cost를 주면 덮어쓴 재료 비용과 효과 창의 순손익을 더한다', () => {
    const r = runCli(['window', '--recipe', 'cook-bait-epic', '--cost', 'cook-bait-epic=common:50,epic:4', '--trials', '2', '--json']);
    expect(r.exitCode).toBe(0);
    const m = JSON.parse(r.stdout).window.material;
    expect(m.cost).toEqual({ common: 50, epic: 4 });
    expect(m.rows.length).toBe(SPOTS.length);
    expect(runCli(['window', '--recipe', 'cook-bait-epic', '--cost', 'cook-bait-epic=common:50,epic:4', '--trials', '2']).stdout).toContain('재료');
  });
});
