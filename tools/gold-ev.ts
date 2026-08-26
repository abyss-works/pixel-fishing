// 골드 기댓값 비교 CLI — 해역별 수동/자동 기댓값을 현행(2단)과 구 1단 추첨 기준으로 나란히 출력.
// 사용: npx tsx tools/gold-ev.ts [--before]   (--before = 구 1단 수치 열 포함)
// 판정 기준: 수동 = GOOD 상시(일반 ÷1.6) · 자동 = 방치 만렙(일반 ×10, 각 해역 진입 레벨 기준).
import { FISH } from '../src/data/fish';
import { SPOTS } from '../src/data/spots';
import { RARITY } from '../src/data/rarity';
import { goldEV } from '../src/game/logic';

const showBefore = process.argv.includes('--before');

const ENTRY_LV: Record<string, number> = {
  pond: 1, river: 3, sea: 6, deep: 7, dragonhole: 10, coron: 11, barrierreef: 12,
};

/** 구 1단 추첨(개체마다 등급 가중치 전액 — v0.6.5까지)의 골드 EV. 역사 비교 전용 */
function evBefore(spotId: string, rareMult = 1, commonMult = 1): number {
  const pool = FISH.filter(f => f.spot === spotId);
  let total = 0, ev = 0;
  for (const f of pool) {
    const w = RARITY[f.rarity].weight
      * (f.rarity === 'common' ? commonMult / rareMult : 1);
    total += w;
    ev += w * f.price;
  }
  return total > 0 ? ev / total : 0;
}

console.log('해역 (진입Lv) | 현행·수동 | 현행·자동' + (showBefore ? ' | 구1단·수동 | 구1단·자동' : ''));
for (const s of SPOTS) {
  const id = s.id as string;
  const good = goldEV(id, { rareMult: 1.6 });
  const auto = goldEV(id, { commonMult: 10 });
  const line = `${s.name} (L${ENTRY_LV[id]}) | ${good.toFixed(1)} | ${auto.toFixed(1)}`;
  console.log(showBefore
    ? `${line} | ${evBefore(id, 1.6).toFixed(1)} | ${evBefore(id, 1, 10).toFixed(1)}`
    : line);
}
