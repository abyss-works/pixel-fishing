// 밸런스 덮어쓰기 — 배 가격·명성 요구치와 해역 요구 파워를 바꾸고, 낚싯대 규칙과 가상 해역을 더해 안을 비교한다.
// 제품 상수 행을 직접 바꾸고 복원 함수를 돌려준다. 규칙 함수가 같은 행을 읽으므로 측정 코드에 값이나 규칙의 복제가 없다.
// 형식: { "boats": { "2": { "price": 2500, "fameReq": 800 } }, "spots": { "sea": { "powerReq": 35, "priceMult": 0.85, "gradeMult": { "rare": 1.1 } } },
//         "rod": { "powerPerLevel": 5, "costGrowth": 1.7 }, "addSpots": [ { "id": "next", "like": "sthelena", "powerReq": 170, "growth": 0.45, "boat": { "price": 5000000, "fameReq": 400000 } } ] }
// priceMult는 그 해역 어종의 판매가에 곱하는 배율이고, gradeMult는 등급별 배율, nightMult는 밤 어종에만 더 곱하는 등급별 배율이다. 곱한 값은 어종 가격 사다리(ladderPrice)로 맞춘다.
// addSpots는 가상 해역을 진행 순서 끝에 더한다. 어종 구성은 like 해역(생략하면 그때 마지막 해역)을 복사하고, 가격은 priceMult를 곱하거나
// growth(기준 해역 ref의 딱렙 방치 EV 대비 증가율)에 맞춘다. 가상 해역의 가격은 사다리로 맞추지 않는다(EV를 정확히 맞추기 위해서다).
import { readFileSync } from 'node:fs';
import { BOATS } from '../../../src/game/content/boats';
import type { Boat } from '../../../src/game/content/boats';
import { FISH } from '../../../src/game/content/fish';
import type { Fish } from '../../../src/game/content/fish';
import { RARITY_ORDER } from '../../../src/game/content/rarity';
import type { RarityId } from '../../../src/game/content/rarity';
import { rarityWeightsOf } from '../../../src/game/content/rarityWeights';
import { SPOTS } from '../../../src/game/content/spots';
import type { Spot, SpotId } from '../../../src/game/content/spots';
import { entryLevel, rates, zoneOf } from '../model';
import { applyRodRules, parseRodRules } from '../rodRules';
import type { RodRules } from '../rodRules';
import { registerVirtualFish, registerVirtualSpot, unregisterVirtualFish, unregisterVirtualSpot } from '../virtualSpots';

export interface BoatOverride { price?: number; fameReq?: number }
export interface SpotOverride { powerReq?: number; priceMult?: number; gradeMult?: Partial<Record<RarityId, number>>; nightMult?: Partial<Record<RarityId, number>> }
/** 가상 해역 — 진행 순서 끝에 더하는 해역. 새 배를 함께 더할 수 있다 */
export interface AddSpot {
  id: string; name?: string;
  /** 어종 구성을 복사할 해역(실제 해역 또는 앞에서 더한 가상 해역). 생략하면 그때 마지막 해역 */
  like?: string;
  /** growth의 기준 해역. 생략하면 그때 마지막 해역 */
  ref?: string;
  powerReq: number;
  /** 지역. 생략하면 like 해역의 지역. 지역 진입 전환으로 재려면 새 이름을 준다 */
  zone?: string;
  /** 복사한 어종 가격에 곱하는 배율 */
  priceMult?: number;
  /** 기준 해역 딱렙 방치 EV 대비 증가율. 가상 해역 진입 레벨의 방치 EV가 기준 EV x (1 + growth)가 되게 가격을 맞춘다. priceMult와 함께 줄 수 없다 */
  growth?: number;
  gradeMult?: Partial<Record<RarityId, number>>;
  /** 이 해역을 여는 새 배. 생략하면 like 해역의 배 단계를 쓴다 */
  boat?: { price: number; fameReq: number };
}
export interface FlowOverride {
  boats?: Record<string, BoatOverride>;
  spots?: Record<string, SpotOverride>;
  rod?: RodRules;
  addSpots?: AddSpot[];
}

const BOAT_KEYS = ['price', 'fameReq'] as const;
const SPOT_KEYS = ['powerReq', 'priceMult', 'gradeMult', 'nightMult'] as const;
const ADD_SPOT_KEYS = ['id', 'name', 'like', 'ref', 'powerReq', 'zone', 'priceMult', 'growth', 'gradeMult', 'boat'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw new Error(`${where}에 알 수 없는 키가 있습니다: ${key} (허용: ${allowed.join(', ')})`);
  }
}

function checkNumbers(obj: Record<string, unknown>, where: string): void {
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'gradeMult' || key === 'nightMult') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${where}.${key}는 숫자여야 합니다`);
    if (value < 0) throw new Error(`${where}.${key}는 0 이상이어야 합니다`);
  }
}

function parseGradeMult(v: unknown, where: string): Partial<Record<RarityId, number>> {
  if (!isObject(v)) throw new Error(`${where}는 객체여야 합니다`);
  const out: Partial<Record<RarityId, number>> = {};
  for (const [grade, mult] of Object.entries(v)) {
    if (!(RARITY_ORDER as string[]).includes(grade)) throw new Error(`${where}에 알 수 없는 등급이 있습니다: ${grade} (허용: ${RARITY_ORDER.join(', ')})`);
    if (typeof mult !== 'number' || !Number.isFinite(mult)) throw new Error(`${where}.${grade}는 숫자여야 합니다`);
    if (mult <= 0) throw new Error(`${where}.${grade}는 0보다 커야 합니다`);
    out[grade as RarityId] = mult;
  }
  return out;
}

function parseAddSpots(raw: unknown): AddSpot[] {
  if (!Array.isArray(raw)) throw new Error('addSpots는 배열이어야 합니다');
  const out: AddSpot[] = [];
  const known = new Set<string>(SPOTS.map(s => s.id));
  raw.forEach((row, i) => {
    const where = `addSpots[${i}]`;
    if (!isObject(row)) throw new Error(`${where}는 객체여야 합니다`);
    checkKeys(row, ADD_SPOT_KEYS, where);
    if (typeof row.id !== 'string' || row.id === '') throw new Error(`${where}.id가 필요합니다`);
    if (known.has(row.id)) throw new Error(`${where}.id가 이미 있는 해역이거나 두 번 나왔습니다: ${row.id}`);
    for (const key of ['like', 'ref'] as const) {
      const v = row[key];
      if (v !== undefined && (typeof v !== 'string' || !known.has(v))) throw new Error(`${where}.${key}에 없는 해역입니다: ${String(v)}`);
    }
    if (typeof row.powerReq !== 'number' || !Number.isFinite(row.powerReq) || row.powerReq < 0) throw new Error(`${where}.powerReq는 0 이상 숫자여야 합니다`);
    if (row.name !== undefined && typeof row.name !== 'string') throw new Error(`${where}.name은 문자열이어야 합니다`);
    if (row.zone !== undefined && (typeof row.zone !== 'string' || row.zone === '')) throw new Error(`${where}.zone은 문자열이어야 합니다`);
    if (row.priceMult !== undefined && row.growth !== undefined) throw new Error(`${where}의 priceMult와 growth는 함께 줄 수 없습니다`);
    if (row.priceMult !== undefined && !(typeof row.priceMult === 'number' && row.priceMult > 0)) throw new Error(`${where}.priceMult는 0보다 큰 숫자여야 합니다`);
    if (row.growth !== undefined && !(typeof row.growth === 'number' && Number.isFinite(row.growth) && row.growth > -1)) throw new Error(`${where}.growth는 -1보다 큰 숫자여야 합니다`);
    const spot: AddSpot = { id: row.id, powerReq: row.powerReq };
    for (const key of ['name', 'like', 'ref', 'zone', 'priceMult', 'growth'] as const) if (row[key] !== undefined) (spot as unknown as Record<string, unknown>)[key] = row[key];
    if (row.gradeMult !== undefined) spot.gradeMult = parseGradeMult(row.gradeMult, `${where}.gradeMult`);
    if (row.boat !== undefined) {
      if (!isObject(row.boat)) throw new Error(`${where}.boat는 객체여야 합니다`);
      checkKeys(row.boat, ['price', 'fameReq'], `${where}.boat`);
      for (const key of ['price', 'fameReq'] as const) {
        const v = row.boat[key];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`${where}.boat.${key}는 0 이상 숫자여야 합니다`);
      }
      spot.boat = { price: row.boat.price as number, fameReq: row.boat.fameReq as number };
    }
    known.add(row.id);
    out.push(spot);
  });
  return out;
}

/** 입력을 검사해 덮어쓰기 형식으로 돌려준다. 알 수 없는 키, 없는 배 단계와 해역, 숫자가 아니거나 음수인 값은 거부한다 */
export function parseOverride(raw: unknown): FlowOverride {
  if (!isObject(raw)) throw new Error('덮어쓰기는 객체여야 합니다');
  checkKeys(raw, ['boats', 'spots', 'rod', 'addSpots'], '덮어쓰기');
  const out: FlowOverride = {};
  if (raw.boats !== undefined) {
    if (!isObject(raw.boats)) throw new Error('boats는 객체여야 합니다');
    out.boats = {};
    for (const [tier, row] of Object.entries(raw.boats)) {
      if (!BOATS.some(b => String(b.tier) === tier)) throw new Error(`없는 배 단계입니다: ${tier}`);
      if (!isObject(row)) throw new Error(`boats.${tier}는 객체여야 합니다`);
      checkKeys(row, BOAT_KEYS, `boats.${tier}`);
      checkNumbers(row, `boats.${tier}`);
      out.boats[tier] = row as BoatOverride;
    }
  }
  if (raw.spots !== undefined) {
    if (!isObject(raw.spots)) throw new Error('spots는 객체여야 합니다');
    out.spots = {};
    for (const [id, row] of Object.entries(raw.spots)) {
      if (!SPOTS.some(s => s.id === id)) throw new Error(`없는 해역입니다: ${id}`);
      if (!isObject(row)) throw new Error(`spots.${id}는 객체여야 합니다`);
      checkKeys(row, SPOT_KEYS, `spots.${id}`);
      checkNumbers(row, `spots.${id}`);
      if (row.priceMult !== undefined && (row.priceMult as number) <= 0) throw new Error(`spots.${id}.priceMult는 0보다 커야 합니다`);
      const { gradeMult, nightMult, ...plain } = row;
      out.spots[id] = {
        ...(plain as SpotOverride),
        ...(gradeMult === undefined ? {} : { gradeMult: parseGradeMult(gradeMult, `spots.${id}.gradeMult`) }),
        ...(nightMult === undefined ? {} : { nightMult: parseGradeMult(nightMult, `spots.${id}.nightMult`) }),
      };
    }
  }
  if (raw.rod !== undefined) out.rod = parseRodRules(raw.rod);
  if (raw.addSpots !== undefined) out.addSpots = parseAddSpots(raw.addSpots);
  return out;
}

/** 어종 가격 사다리(목표 기대값을 모르므로 가장 가까운 값으로만 맞춘다. 425는 430) — 일반 등급은 정수, 희귀 이상은 한 자리 수면 정수, 두 자리 수면 5 단위, 세 자리 이상이면 앞 두 자리 유효숫자.
 *  모두 가장 가까운 값으로 맞춘다 */
export function ladderPrice(price: number, rarity: RarityId): number {
  if (rarity === 'common' || price < 10) return Math.round(price);
  if (price < 100) return Math.round(price / 5) * 5;
  const step = 10 ** (Math.floor(Math.log10(price)) - 1);
  return Math.round(price / step) * step;
}

/** 파일에서 덮어쓰기를 읽는다 */
export function loadOverride(path: string): FlowOverride {
  let text: string;
  try {
    text = readFileSync(path, 'utf-8');
  } catch {
    throw new Error(`덮어쓰기 파일을 읽을 수 없습니다: ${path}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`덮어쓰기 파일이 올바른 JSON이 아닙니다: ${path}`);
  }
  return parseOverride(raw);
}

/** 덮어쓰기를 제품 상수 행에 적용하고 원래 값으로 되돌리는 함수를 돌려준다 */
export function applyOverride(o: FlowOverride): () => void {
  const undo: (() => void)[] = [];
  if (o.rod) undo.push(applyRodRules(o.rod));
  for (const [tier, patch] of Object.entries(o.boats ?? {})) {
    const row = BOATS.find(b => String(b.tier) === tier)!;
    const prev = { price: row.price, fameReq: row.fameReq };
    undo.push(() => { row.price = prev.price; row.fameReq = prev.fameReq; });
    if (patch.price !== undefined) row.price = patch.price;
    if (patch.fameReq !== undefined) row.fameReq = patch.fameReq;
  }
  for (const [id, patch] of Object.entries(o.spots ?? {})) {
    const row = SPOTS.find(s => s.id === id)!;
    const prev = { has: 'powerReq' in row, value: row.powerReq };
    undo.push(() => { if (prev.has) row.powerReq = prev.value; else delete row.powerReq; });
    if (patch.powerReq !== undefined) row.powerReq = patch.powerReq;
    if (patch.priceMult !== undefined || patch.gradeMult !== undefined || patch.nightMult !== undefined) {
      for (const fish of FISH.filter(f => f.spot === id)) {
        const grade = patch.gradeMult?.[fish.rarity];
        const night = fish.night ? patch.nightMult?.[fish.rarity] : undefined;
        if (patch.priceMult === undefined && grade === undefined && night === undefined) continue;
        const prevPrice = fish.price;
        undo.push(() => { fish.price = prevPrice; });
        fish.price = ladderPrice(prevPrice * (patch.priceMult ?? 1) * (grade ?? 1) * (night ?? 1), fish.rarity);
      }
    }
  }
  for (const spec of o.addSpots ?? []) undo.push(addSpot(spec));
  return () => { for (const f of undo.reverse()) f(); undo.length = 0; };
}

/** 가상 해역 하나를 진행 순서 끝에 더하고 되돌리는 함수를 돌려준다 */
function addSpot(spec: AddSpot): () => void {
  const spots = SPOTS as Spot[], boats = BOATS as Boat[], fishList = FISH as Fish[];
  const like = spots.find(s => s.id === (spec.like ?? spots.at(-1)!.id))!;
  const ref = (spec.ref ?? spots.at(-1)!.id) as SpotId;
  const id = spec.id as SpotId;
  let boat: Boat | undefined;
  if (spec.boat) {
    const last = BOATS.at(-1)!;
    boat = { ...last, tier: last.tier + 1, name: `가상 배 ${last.tier + 1}`, price: spec.boat.price, fameReq: spec.boat.fameReq };
    boats.push(boat);
  }
  const weights = rarityWeightsOf(like.id);
  const row: Spot = {
    ...like, id, name: spec.name ?? spec.id, boatTier: boat ? boat.tier : like.boatTier, powerReq: spec.powerReq,
    rarityWeight: like.rarityWeight ?? { rare: weights.rare, epic: weights.epic, legendary: weights.legendary },
  };
  spots.push(row);
  registerVirtualSpot(id, spec.zone ?? zoneOf(like.id));
  const copies = fishList.filter(f => f.spot === like.id).map(f => ({ ...f, id: `${f.id}@${spec.id}`, spot: id }));
  for (const c of copies) { fishList.push(c); registerVirtualFish(c.id); }
  const scale = (factor: (f: Fish) => number) => { for (const c of copies) c.price *= factor(c); };
  const grade = (f: Fish) => spec.gradeMult?.[f.rarity] ?? 1;
  scale(f => (spec.priceMult ?? 1) * grade(f));
  if (spec.growth !== undefined) {
    const target = rates(ref, entryLevel(ref), 'idle').goldPerHour * (1 + spec.growth);
    const now = rates(id, entryLevel(id), 'idle').goldPerHour;
    scale(() => target / now);
  }
  return () => {
    for (const c of copies) { fishList.splice(fishList.indexOf(c), 1); unregisterVirtualFish(c.id); }
    spots.splice(spots.indexOf(row), 1);
    unregisterVirtualSpot(id);
    if (boat) boats.splice(boats.indexOf(boat), 1);
  };
}
