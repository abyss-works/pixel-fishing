// 낚싯대 규칙 — 레벨당 파워, 강화비 계수, 입질 감쇠, 방치 배수 표를 도구 안에서 덮어써 안을 비교한다.
// 강화비 계수와 입질 감쇠는 제품 함수가 읽는 상수 객체의 값을 바꾸고 복원 함수를 돌려준다(제품 함수를 그대로 부른다).
// 레벨당 파워와 방치 배수의 레벨 차 계산은 제품 함수가 상수를 리터럴로 갖고 있어 덮어쓸 수 없으므로, 측정 코드가 이 모듈의 함수를 쓴다.
// 레벨당 파워를 바꿔도 파워 미달 페널티의 간격(제품 규칙의 shortStep, 파워 단위)은 제품 값 그대로다.
// 덮어쓰지 않았을 때는 제품 공개 함수와 결과가 같다(테스트가 모든 레벨·파워에서 대조한다).
import { ROD } from '../../src/game/rules/balance';
import { rodStats } from '../../src/game/rules/logic';
import { IDLE_BOOST_STEPS } from '../../src/game/rules/power';
import { powerOfLevel as productPower } from '../../src/game/rules/stats';
import { powerReqOf } from '../../src/game/content/spots';
import type { SpotId } from '../../src/game/content/spots';
import { topZoneOfSpot } from '../../src/game/content/zones';

/** 제품의 레벨당 파워 — 레벨 1과 2의 파워 차다(상수를 복제하지 않고 제품 함수에서 읽는다) */
const PRODUCT_PER_LEVEL = productPower(2) - productPower(1);
const BASE_POWER = productPower(1);

let perLevel = PRODUCT_PER_LEVEL;
let idleBasis: 'level' | 'power' = 'level';
let idleUnit = PRODUCT_PER_LEVEL;
let biteMode: BiteDecayMode = 'both';

/** 입질 대기 감소 방식 — both는 레벨마다 최소와 최대를 함께 줄이고(제품 규칙), alternate는 홀수 레벨에서 강화할 때 최대만, 짝수 레벨에서 강화할 때 최소만 줄인다 */
export type BiteDecayMode = 'both' | 'alternate';

/** 레벨의 입질 대기 최소와 최대(초). both는 제품 함수를 그대로 부르고, alternate는 최대 = 기본 최대 x 감쇠^올림((L-1)/2), 최소 = 기본 최소 x 감쇠^내림((L-1)/2) */
export function biteRangeOf(level: number): { biteMin: number; biteMax: number } {
  if (biteMode === 'both') {
    const st = rodStats(level);
    return { biteMin: st.biteMin, biteMax: st.biteMax };
  }
  return {
    biteMin: ROD.biteMin * ROD.biteDecay ** Math.floor((level - 1) / 2),
    biteMax: ROD.biteMax * ROD.biteDecay ** Math.ceil((level - 1) / 2),
  };
}

/** 레벨의 낚싯대 파워 — 레벨 1의 파워에 레벨당 파워를 더한다 */
export const powerOfLevel = (level: number): number => BASE_POWER + (level - 1) * perLevel;

/** 파워를 채우는 최소 레벨 */
export const minLevelOfPower = (power: number): number =>
  power <= powerOfLevel(1) ? 1 : Math.ceil((power - BASE_POWER) / perLevel) + 1;

/** 제품이 정한 레벨당 파워(덮어쓰기 전) */
export const PRODUCT_POWER_PER_LEVEL = PRODUCT_PER_LEVEL;

/** 현재 레벨당 파워 */
export const powerPerLevel = (): number => perLevel;

const stepsOf = (spot: SpotId): readonly number[] =>
  topZoneOfSpot(spot) === 'village' ? IDLE_BOOST_STEPS.village : IDLE_BOOST_STEPS.world;

/** 방치 배수 — 해역 요구 파워를 넘은 만큼을 단계로 세어 표에서 고른다. 단계는 레벨 차(현재 레벨당 파워로 나눔) 또는 파워 초과(주어진 단위로 나눔)다 */
export function relativeIdleBoost(power: number, spot: SpotId): number {
  const steps = stepsOf(spot);
  const unit = idleBasis === 'level' ? perLevel : idleUnit;
  const levels = Math.max(0, Math.floor((power - powerReqOf(spot)) / unit));
  return steps[Math.min(levels, steps.length - 1)];
}

export interface IdleBoostRules {
  /** 마을 해역과 그 밖의 해역의 배수 표. 레벨 차 0, 1, 2, ...이고 마지막 값이 하한이다 */
  village?: number[];
  world?: number[];
  /** level이면 레벨 차(요구 파워를 넘은 만큼 ÷ 레벨당 파워), power이면 파워 초과(÷ unit). 기본 level */
  basis?: 'level' | 'power';
  /** 파워 초과 기준의 한 단계 파워. 생략하면 제품의 레벨당 파워 */
  unit?: number;
}

export interface RodRules {
  powerPerLevel?: number;
  costBase?: number; costGrowth?: number; costPowerFrom?: number; costPowerExp?: number;
  biteDecay?: number;
  /** 입질 대기 감소 방식. 생략하면 both(제품 규칙) */
  biteDecayMode?: BiteDecayMode;
  idleBoost?: IdleBoostRules;
}

const NUMBER_KEYS = ['powerPerLevel', 'costBase', 'costGrowth', 'costPowerFrom', 'costPowerExp', 'biteDecay'] as const;
const IDLE_KEYS = ['village', 'world', 'basis', 'unit'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw new Error(`${where}에 알 수 없는 키가 있습니다: ${key} (허용: ${allowed.join(', ')})`);
  }
}

const num = (v: unknown, where: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${where}는 숫자여야 합니다`);
  return v;
};

function steps(v: unknown, where: string): number[] {
  if (!Array.isArray(v)) throw new Error(`${where}는 배열이어야 합니다`);
  if (v.length === 0) throw new Error(`${where}는 비어 있을 수 없습니다`);
  return v.map((x, i) => {
    const n = num(x, `${where}[${i}]`);
    if (n <= 0) throw new Error(`${where}[${i}]는 0보다 커야 합니다`);
    return n;
  });
}

/** 입력을 검사해 낚싯대 규칙 형식으로 돌려준다 */
export function parseRodRules(raw: unknown): RodRules {
  if (!isObject(raw)) throw new Error('rod는 객체여야 합니다');
  checkKeys(raw, [...NUMBER_KEYS, 'biteDecayMode', 'idleBoost'], 'rod');
  const out: RodRules = {};
  for (const key of NUMBER_KEYS) {
    if (raw[key] === undefined) continue;
    const v = num(raw[key], `rod.${key}`);
    if (v <= 0) throw new Error(`rod.${key}는 0보다 커야 합니다`);
    if (key === 'biteDecay' && v > 1) throw new Error('rod.biteDecay는 1 이하여야 합니다');
    out[key] = v;
  }
  if (raw.biteDecayMode !== undefined) {
    if (raw.biteDecayMode !== 'both' && raw.biteDecayMode !== 'alternate') throw new Error('rod.biteDecayMode는 both 또는 alternate여야 합니다');
    out.biteDecayMode = raw.biteDecayMode;
  }
  if (raw.idleBoost !== undefined) {
    const b = raw.idleBoost;
    if (!isObject(b)) throw new Error('rod.idleBoost는 객체여야 합니다');
    checkKeys(b, IDLE_KEYS, 'rod.idleBoost');
    const idle: IdleBoostRules = {};
    if (b.village !== undefined) idle.village = steps(b.village, 'rod.idleBoost.village');
    if (b.world !== undefined) idle.world = steps(b.world, 'rod.idleBoost.world');
    if (b.basis !== undefined) {
      if (b.basis !== 'level' && b.basis !== 'power') throw new Error('rod.idleBoost.basis는 level 또는 power여야 합니다');
      idle.basis = b.basis;
    }
    if (b.unit !== undefined) {
      const u = num(b.unit, 'rod.idleBoost.unit');
      if (u <= 0) throw new Error('rod.idleBoost.unit은 0보다 커야 합니다');
      idle.unit = u;
    }
    out.idleBoost = idle;
  }
  return out;
}

/** 낚싯대 규칙을 적용하고 원래 값으로 되돌리는 함수를 돌려준다 */
export function applyRodRules(r: RodRules): () => void {
  const rod = ROD as unknown as Record<string, number>;
  const prevRod = { ...rod };
  const prevPer = perLevel, prevBasis = idleBasis, prevUnit = idleUnit, prevBite = biteMode;
  const prevVillage = [...IDLE_BOOST_STEPS.village], prevWorld = [...IDLE_BOOST_STEPS.world];
  for (const key of NUMBER_KEYS) {
    if (key === 'powerPerLevel' || r[key] === undefined) continue;
    rod[key] = r[key]!;
  }
  if (r.powerPerLevel !== undefined) perLevel = r.powerPerLevel;
  if (r.biteDecayMode !== undefined) biteMode = r.biteDecayMode;
  const replace = (target: readonly number[], next: number[]) => { (target as number[]).splice(0, target.length, ...next); };
  if (r.idleBoost?.village) replace(IDLE_BOOST_STEPS.village, r.idleBoost.village);
  if (r.idleBoost?.world) replace(IDLE_BOOST_STEPS.world, r.idleBoost.world);
  if (r.idleBoost?.basis) idleBasis = r.idleBoost.basis;
  if (r.idleBoost?.unit !== undefined) idleUnit = r.idleBoost.unit;
  return () => {
    Object.assign(rod, prevRod);
    perLevel = prevPer; idleBasis = prevBasis; idleUnit = prevUnit; biteMode = prevBite;
    replace(IDLE_BOOST_STEPS.village, prevVillage);
    replace(IDLE_BOOST_STEPS.world, prevWorld);
  };
}
