// 방치 EV — 밸런스는 방치 낚시의 시간당 기대 골드(방치 EV)로 맞추고, 의뢰와 토벌 보상은 그 구역 방치 EV의 몇 시간어치인지로 본다.
// 해역별 EV는 해역 진입 레벨(딱렙)과 다음 해역 진입 직전 레벨 두 기준 레벨에서 낮밤 혼합 방치 수입(G/h)으로 잰다.
// 구역 대표 EV 후보는 둘이다: 구역 마지막 해역의 딱렙 EV, 구역 해역 딱렙 EV의 평균.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { BOUNTIES, BOUNTY_ZONES } from '../../../src/game/content/bounties';
import type { BountyDifficulty, BountyZone } from '../../../src/game/content/bounties';
import { SPEC_MARGIN, entryLevel, rates, spotsOfZone, zoneOf } from '../model';

/** 일반 의뢰 보상의 목표 — 그 구역 방치 EV의 몇 시간어치인가 */
export const GENERAL_TARGET_HOURS = { easy: 0.5, normal: 1, hard: 2 } as const;
/** 네임드 토벌 보상의 목표 범위(시간) */
export const NAMED_TARGET_HOURS: readonly [number, number] = [4, 8];

/** 보상 값 반올림 — 앞 두 자리 유효숫자. 보상용 규칙이 따로 없어 어종 가격의 규칙을 준용한다 */
export function roundReward(x: number): number {
  if (x < 100) return Math.round(x);
  const unit = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / unit) * unit;
}

const idleEv = (spot: SpotId, level: number) => rates(spot, level, 'idle').goldPerHour;

export interface SpotEv {
  spot: SpotId;
  zone: string;
  entryLevel: number; entryEv: number;
  /** 다음 해역 진입 직전 레벨. 마지막 해역은 진입 레벨 + 여유 레벨이다 */
  preNextLevel: number; preNextEv: number;
  preNextIsMargin: boolean;
}

export interface ZoneEv {
  zone: BountyZone;
  /** 후보 1 — 구역 마지막 해역의 딱렙 EV */
  lastEntryEv: number;
  /** 후보 2 — 구역 해역 딱렙 EV의 평균 */
  meanEntryEv: number;
}

export interface RewardRow {
  zone: BountyZone;
  difficulty: BountyDifficulty;
  reward: number;
  /** 대표 EV 후보별로 현재 보상이 몇 시간어치인가 */
  hours: { last: number; mean: number };
  /** 목표 시간 범위(일반은 한 값) */
  target: [number, number];
  /** 목표와의 시간 차 — 범위 안이면 0, 밖이면 가까운 끝과의 차(양수는 보상이 목표보다 큼) */
  gap: { last: number; mean: number };
  /** 목표에 맞추려면 필요한 보상(목표 범위의 양 끝) */
  needed: { last: [number, number]; mean: [number, number] };
}

export interface EvReport { spots: SpotEv[]; zones: ZoneEv[]; rewards: RewardRow[] }

export function evReport(): EvReport {
  const spots: SpotEv[] = SPOTS.map((s, i) => {
    const entry = entryLevel(s.id);
    const next = SPOTS[i + 1];
    const preNextLevel = next ? Math.max(entry, entryLevel(next.id) - 1) : entry + SPEC_MARGIN;
    return {
      spot: s.id, zone: zoneOf(s.id), entryLevel: entry, entryEv: idleEv(s.id, entry),
      preNextLevel, preNextEv: idleEv(s.id, preNextLevel), preNextIsMargin: !next,
    };
  });
  const zones: ZoneEv[] = BOUNTY_ZONES.map(zone => {
    const evs = spotsOfZone(zone).map(s => idleEv(s.id, entryLevel(s.id)));
    return { zone, lastEntryEv: evs[evs.length - 1], meanEntryEv: evs.reduce((a, b) => a + b, 0) / evs.length };
  });
  const rewards: RewardRow[] = [];
  for (const z of zones) {
    for (const difficulty of ['easy', 'normal', 'hard', 'named'] as const) {
      const quests = BOUNTIES.filter(q => q.zone === z.zone && q.difficulty === difficulty);
      if (quests.length === 0) continue;
      const reward = quests.reduce((a, q) => a + q.reward, 0) / quests.length;
      const target: [number, number] = difficulty === 'named' ? [...NAMED_TARGET_HOURS] : [GENERAL_TARGET_HOURS[difficulty], GENERAL_TARGET_HOURS[difficulty]];
      const row = (ev: number) => {
        const h = reward / ev;
        return { hours: h, gap: h < target[0] ? h - target[0] : h > target[1] ? h - target[1] : 0, needed: [roundReward(target[0] * ev), roundReward(target[1] * ev)] as [number, number] };
      };
      const l = row(z.lastEntryEv), m = row(z.meanEntryEv);
      rewards.push({
        zone: z.zone, difficulty, reward, target,
        hours: { last: l.hours, mean: m.hours }, gap: { last: l.gap, mean: m.gap }, needed: { last: l.needed, mean: m.needed },
      });
    }
  }
  return { spots, zones, rewards };
}
