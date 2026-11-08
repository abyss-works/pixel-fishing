// 하루 의뢰·토벌 계획 — 제품 데이터(의뢰 행, 라이선스 등급, 네임드 조우 확률과 천장)를 그대로 읽고 기댓값으로 계산한다.
// 가정: 라이선스는 구역 도감(일반 폼) 완성 확률이 LICENSE_PROB를 넘는 날부터 쓴다. 어종 천장은 넣지 않는다.
//       의뢰 수행 중에는 그 구역의 낚을 수 있는 해역을 같은 시간씩 낚고, 항구 이동 시간은 넣지 않는다.
//       네임드 결투는 항상 이긴다. 납품한 물고기는 팔지 못한다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { FISH } from '../../../src/game/content/fish';
import { BOUNTIES, BOUNTY_ZONES } from '../../../src/game/content/bounties';
import type { BountyDifficulty, BountyTier, BountyZone } from '../../../src/game/content/bounties';
import { LICENSE_GRADES, namedEncounterCandidates, namedEncounterShare } from '../../../src/game/rules/logic';
import { NAMED_PITY_CATCHES } from '../../../src/game/rules/pity';
import { powerOfLevel } from '../../../src/game/rules/stats';
import { VARIANT_EV, zoneOf } from '../model';
import type { Rates } from '../model';

/** 구역 도감을 모두 모았을 확률이 이 값을 넘으면 라이선스를 쓴다 */
export const LICENSE_PROB = 0.5;

/** 어종 id → 일반 폼을 한 번도 못 잡을 확률의 로그(0 이하). 기록이 없는 어종은 확률 1(로그 0)이다 */
export type DexLog = Map<string, number>;

/** 구역 도감 완성 확률 — 어종이 서로 독립이라고 보고 곱한다. 해당 등급 어종이 없으면 0 */
export function dexCompletion(dex: DexLog, zone: BountyZone, tier: BountyTier): number {
  const fish = FISH.filter(f => zoneOf(f.spot) === zone && LICENSE_GRADES[tier].includes(f.rarity));
  if (fish.length === 0) return 0;
  return fish.reduce((p, f) => p * (1 - Math.exp(dex.get(f.id) ?? 0)), 1);
}

export const licenseHeld = (dex: DexLog, zone: BountyZone, tier: BountyTier): boolean =>
  dexCompletion(dex, zone, tier) > LICENSE_PROB;

/** 매 캐치 확률 p로 조우하고 ceiling번째 캐치에서 확정될 때의 조우까지 기대 캐치 수 */
export const expectedEncounterCatches = (p: number, ceiling: number): number => (1 - (1 - p) ** ceiling) / p;

export interface Player { boat: number; level: number }

/** 구역에서 지금 낚을 수 있는 해역 — 배가 열리고 파워가 요구를 채운 해역 */
export const accessibleSpots = (zone: BountyZone, p: Player): SpotId[] =>
  SPOTS.filter(s => zoneOf(s.id) === zone && s.boatTier <= p.boat && powerOfLevel(p.level) >= (s.powerReq ?? 0)).map(s => s.id);

export interface PlanInput {
  player: Player;
  /** 지금 낚는 해역의 수입 */
  current: Rates;
  /** 해역의 수입 — 호출부가 축과 레벨을 정해 둔다 */
  rateAt: (spot: SpotId) => Rates;
  licensed: (zone: BountyZone, tier: BountyTier) => boolean;
  /** 오늘 의뢰에 쓸 수 있는 낚시 시간(초) */
  seconds: number;
}

export interface Activity {
  kind: 'general' | 'named';
  zone: BountyZone;
  difficulty: BountyDifficulty;
  /** 기대 소요 시간(초) */
  seconds: number;
  /** 낚는 해역 — 같은 시간씩 낚는다 */
  spots: SpotId[];
  /** 보상에서 납품한 물고기 판매가를 뺀 골드 */
  lump: number;
  /** 같은 시간을 지금 해역에서 낚는 경우와 비교한 골드 이득 */
  gain: number;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const avgOf = (spots: SpotId[], f: (s: SpotId) => number) => mean(spots.map(f));

function namedPlan(input: PlanInput): Activity | null {
  let best: Activity | null = null;
  for (const zone of BOUNTY_ZONES) {
    if (!input.licensed(zone, 'named')) continue;
    const quest = BOUNTIES.find(q => q.zone === zone && q.difficulty === 'named');
    if (!quest) continue;
    const spots = accessibleSpots(zone, input.player).filter(s => namedEncounterCandidates([quest.id], s).length > 0);
    if (spots.length === 0) continue;
    const catches = expectedEncounterCatches(avgOf(spots, namedEncounterShare), NAMED_PITY_CATCHES);
    const hours = catches / avgOf(spots, s => input.rateAt(s).catchesPerHour);
    const gain = quest.reward + (avgOf(spots, s => input.rateAt(s).goldPerHour) - input.current.goldPerHour) * hours;
    if (hours * 3600 > input.seconds || gain <= 0) continue;
    if (!best || gain > best.gain) best = { kind: 'named', zone, difficulty: 'named', seconds: hours * 3600, spots, lump: quest.reward, gain };
  }
  return best;
}

function generalPlan(input: PlanInput, seconds: number): Activity | null {
  let best: Activity | null = null;
  for (const zone of BOUNTY_ZONES) {
    if (!input.licensed(zone, 'basic')) continue;
    const spots = accessibleSpots(zone, input.player);
    if (spots.length === 0) continue;
    const zoneGold = avgOf(spots, s => input.rateAt(s).goldPerHour);
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const options = BOUNTIES.filter(q => q.zone === zone && q.difficulty === difficulty);
      if (options.length === 0) continue;
      let gain = 0, secs = 0, lump = 0;
      for (const q of options) {
        const perHour = avgOf(spots, s => input.rateAt(s).rows.filter(r => r.fish.rarity === q.grade).reduce((a, r) => a + r.prob, 0) * input.rateAt(s).catchesPerHour);
        if (perHour <= 0) continue;
        const hours = q.count / perHour;
        const gradeProb = avgOf(spots, s => input.rateAt(s).rows.filter(r => r.fish.rarity === q.grade).reduce((a, r) => a + r.prob, 0));
        const gradePrice = avgOf(spots, s => input.rateAt(s).rows.filter(r => r.fish.rarity === q.grade).reduce((a, r) => a + r.prob * r.fish.price, 0)) / gradeProb;
        const net = q.reward - q.count * gradePrice * VARIANT_EV;
        const g = net + (zoneGold - input.current.goldPerHour) * hours;
        if (hours * 3600 > seconds || g <= 0) continue;
        gain += g / options.length; secs += hours * 3600 / options.length; lump += net / options.length;
      }
      if (gain > 0 && (!best || gain > best.gain)) best = { kind: 'general', zone, difficulty, seconds: secs, spots, lump, gain };
    }
  }
  return best;
}

/** 하루의 의뢰 계획 — 네임드 토벌을 먼저 고르고 남은 시간에 들어가는 일반 의뢰를 고른다. 각각 하루 1회다 */
export function planBounties(input: PlanInput): Activity[] {
  const named = namedPlan(input);
  const general = generalPlan(input, input.seconds - (named?.seconds ?? 0));
  return [named, general].filter((a): a is Activity => a !== null);
}
