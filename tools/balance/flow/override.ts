// 밸런스 덮어쓰기 — 배 가격·명성 요구치와 해역 요구 파워를 바꿔 안을 비교한다.
// 제품 상수 행을 직접 바꾸고 복원 함수를 돌려준다. 규칙 함수가 같은 행을 읽으므로 측정 코드에 값이나 규칙의 복제가 없다.
// 형식: { "boats": { "2": { "price": 2500, "fameReq": 800 } }, "spots": { "sea": { "powerReq": 35 } } }
import { readFileSync } from 'node:fs';
import { BOATS } from '../../../src/game/content/boats';
import { SPOTS } from '../../../src/game/content/spots';

export interface BoatOverride { price?: number; fameReq?: number }
export interface SpotOverride { powerReq?: number }
export interface FlowOverride {
  boats?: Record<string, BoatOverride>;
  spots?: Record<string, SpotOverride>;
}

const BOAT_KEYS = ['price', 'fameReq'] as const;
const SPOT_KEYS = ['powerReq'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw new Error(`${where}에 알 수 없는 키가 있습니다: ${key} (허용: ${allowed.join(', ')})`);
  }
}

function checkNumbers(obj: Record<string, unknown>, where: string): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${where}.${key}는 숫자여야 합니다`);
    if (value < 0) throw new Error(`${where}.${key}는 0 이상이어야 합니다`);
  }
}

/** 입력을 검사해 덮어쓰기 형식으로 돌려준다. 알 수 없는 키, 없는 배 단계와 해역, 숫자가 아니거나 음수인 값은 거부한다 */
export function parseOverride(raw: unknown): FlowOverride {
  if (!isObject(raw)) throw new Error('덮어쓰기는 객체여야 합니다');
  checkKeys(raw, ['boats', 'spots'], '덮어쓰기');
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
      out.spots[id] = row as SpotOverride;
    }
  }
  return out;
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
  }
  return () => { for (const f of undo.reverse()) f(); undo.length = 0; };
}
