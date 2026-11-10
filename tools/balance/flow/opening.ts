// 최초 10분 — 새 계정이 수동 낚시로 첫 바다 해역(배가 필요한 첫 해역)에 닿기까지.
// 첫 경험 보장(영웅과 전설 한 번씩)은 제품의 보장 규칙 함수로 판정하고, 보장 어종의 판매가는 그 해역 풀의 해당 등급 평균으로 본다.
// 가정: 캐치마다 판매는 즉시이고 보장 캐치의 획득 연출도 일반 캐치와 같은 길이다. 쿠폰은 쓰지 않는다. 낚는 시간만 센다
//       (도보 이동, 판매와 구매 창 조작, 안내에 드는 시간은 넣지 않는다). 강화를 먼저 다 하고 배를 산다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { BOATS } from '../../../src/game/content/boats';
import { RARITY } from '../../../src/game/content/rarity';
import {
  FIRST_CATCH_LEGEND_MAX, FIRST_CATCH_LEGEND_MIN, endedFirstCatch, firstCatchTarget, newFirstCatch, settleFirstCatch,
} from '../../../src/game/rules/firstCatch';
import { fishPool } from '../../../src/game/rules/logic';
import { powerOfLevel } from '../../../src/game/rules/stats';
import { upgradeCost } from '../../../src/game/rules/balance';
import { VARIANT_EV, axisAvailable, entryLevel, rates, rodSpec } from '../model';
import type { Axis, Rates } from '../model';
import type { Sampler } from './sample';

/** 최초 시작 후 바다에 닿아야 하는 목표 시간(초) */
export const OPENING_TARGET_SEC = 600;

/** 수동 판정 — 무판정 또는 GOOD(노란 존이 있을 때만) */
export type Judgment = 'normal' | 'good';

export interface OpeningOptions {
  judgment: Judgment;
  /** 전설 보장이 나올 캐치 번호. null이면 첫 경험 보장이 없는 비교용이고, 'draw'면 제품 규칙대로 표본 난수가 번호를 정한다(sampler 필요) */
  legendAt: number | 'draw' | null;
  /** 주면 캐치마다 시간, 어종, 돌연변이를 뽑는다(몬테카를로). 생략하면 기댓값 경로다 */
  sampler?: Sampler;
}

export interface OpeningStep {
  kind: 'guarantee' | 'upgrade' | 'move' | 'boat' | 'arrive';
  /** 보장은 등급, 강화는 도달 레벨, 이동과 도착은 해역 id, 배는 단계 */
  detail: string;
  catches: number;
  seconds: number;
}

export interface OpeningResult {
  options: OpeningOptions;
  target: SpotId;
  steps: OpeningStep[];
  arrival: { catches: number; seconds: number } | null;
}

const MAX_CATCHES = 2000;

export function simulateOpening(o: OpeningOptions): OpeningResult {
  if (o.legendAt === 'draw' && !o.sampler) throw new Error('전설 번호를 뽑으려면 표본 추출기가 필요합니다');
  if (typeof o.legendAt === 'number' && (!Number.isInteger(o.legendAt) || o.legendAt < FIRST_CATCH_LEGEND_MIN || o.legendAt > FIRST_CATCH_LEGEND_MAX)) {
    throw new Error(`전설 보장 번호는 ${FIRST_CATCH_LEGEND_MIN}에서 ${FIRST_CATCH_LEGEND_MAX} 사이 정수여야 합니다`);
  }
  const target = SPOTS.find(s => s.boatTier >= 1)!;
  const targetLevel = entryLevel(target.id);
  const boatToBuy = BOATS.find(b => b.tier === target.boatTier)!;
  const sampler = o.sampler;
  const noRng = () => 0;
  let fc = o.legendAt === null ? endedFirstCatch() : o.legendAt === 'draw' ? newFirstCatch() : { ...newFirstCatch(), legendAt: o.legendAt };
  let gold = 0, fame = 0, level = 1, boat = 0, sec = 0, n = 0;
  let spot = SPOTS[0];
  const steps: OpeningStep[] = [];
  let arrival: OpeningResult['arrival'] = null;
  const log = (kind: OpeningStep['kind'], detail: string) => steps.push({ kind, detail, catches: n, seconds: sec });

  const axisOf = (id: SpotId, lv: number): Axis =>
    o.judgment === 'good' && axisAvailable(rodSpec(id, lv), 'good') ? 'good' : 'normal';

  const cache = new Map<string, Rates>();
  const rateAt = (id: SpotId, lv: number): Rates => {
    const axis = axisOf(id, lv);
    const key = `${id}:${lv}:${axis}`;
    let r = cache.get(key);
    if (!r) { r = rates(id, lv, axis); cache.set(key, r); }
    return r;
  };

  while (n < MAX_CATCHES) {
    const r = rateAt(spot.id, level);
    sec += sampler ? sampler.cycleSec(r) : 3600 / r.catchesPerHour;
    n += 1;
    // 보장 대상이면 해역 풀의 해당 등급 평균 판매가(표본이면 뽑힌 어종의 판매가)를, 아니면 통상 기댓값(표본이면 뽑힌 캐치)을 번다
    const guaranteed = firstCatchTarget(fc, spot.id, 'day', sampler?.rng ?? noRng);
    if (guaranteed) {
      if (sampler) {
        const c = sampler.valueOf(guaranteed);
        gold += c.gold; fame += c.fame;
      } else {
        const pool = fishPool(spot.id, 'day').filter(f => f.rarity === guaranteed.rarity);
        gold += pool.reduce((s, f) => s + f.price, 0) / pool.length * VARIANT_EV;
        fame += RARITY[guaranteed.rarity].fame;
      }
      log('guarantee', guaranteed.rarity);
    } else if (sampler) {
      const c = sampler.catchOf(r);
      gold += c.gold; fame += c.fame;
    } else {
      gold += r.goldPerHour / r.catchesPerHour;
      fame += r.famePerHour / r.catchesPerHour;
    }
    fc = settleFirstCatch(fc, guaranteed, sampler?.rng ?? noRng);

    while (level < targetLevel && gold >= upgradeCost(level)) {
      gold -= upgradeCost(level); level += 1;
      log('upgrade', String(level));
    }
    if (level >= targetLevel && boat < target.boatTier && gold >= boatToBuy.price && fame >= boatToBuy.fameReq) {
      gold -= boatToBuy.price; boat = boatToBuy.tier;
      log('boat', String(boat));
    }
    // 열린 해역 중 가장 뒤로 옮긴다
    const best = SPOTS.filter(s => boat >= s.boatTier && powerOfLevel(level) >= (s.powerReq ?? 0)).at(-1)!;
    if (best.id !== spot.id) {
      spot = best;
      log(best.id === target.id ? 'arrive' : 'move', best.id);
    }
    if (spot.id === target.id && !arrival) arrival = { catches: n, seconds: sec };
    // 기댓값 경로는 도착하면 끝낸다. 표본 경로는 보장이 남았으면 그 해역에서 더 낚아 보장 캐치의 시각을 잰다
    if (arrival && (!sampler || (!fc.epic && !fc.legend))) break;
  }
  return { options: o, target: target.id, steps, arrival };
}
