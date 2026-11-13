// 방치 EV — 밸런스는 방치 낚시의 시간당 기대 골드(방치 EV)로 맞추고, 의뢰와 토벌 보상은 그 구역 방치 EV의 시간어치로 정한다.
// 해역별 EV는 해역 진입 레벨(딱렙)과 다음 해역 진입 직전 레벨 두 기준 레벨에서 낮밤 혼합 방치 수입(G/h)으로 잰다.
// 구역 대표 EV는 구역 마지막 해역의 딱렙 EV다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { BOUNTIES, BOUNTY_ZONES } from '../../../src/game/content/bounties';
import type { BountyDifficulty, BountyZone } from '../../../src/game/content/bounties';
import { SPEC_MARGIN, entryLevel, rates, spotsOfZone, zoneOf } from '../model';

/** 일반 의뢰 보상의 목표 — 그 구역 방치 EV의 몇 시간어치인가 */
export const GENERAL_TARGET_HOURS = { easy: 1, normal: 2, hard: 4 } as const;
/** 네임드 토벌 보상의 목표(시간) */
export const NAMED_TARGET_HOURS = 8;

/** 보상 값 반올림 — 앞자리가 5나 10 단위로 떨어지게 자릿수 반올림한다.
 *  해석: 정수 자릿수가 n(3 이상)이면 5 x 10^(n-2) 단위로 맞춘다(첫 두 자리가 5의 배수). 두 자리는 5 단위, 한 자리는 정수다 */
export function roundReward(x: number): number {
  if (x < 10) return Math.round(x);
  const digits = Math.floor(Math.log10(x)) + 1;
  const step = digits === 2 ? 5 : 5 * 10 ** (digits - 2);
  return Math.round(x / step) * step;
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
  /** 구역 대표 방치 EV — 구역 마지막 해역의 딱렙 EV */
  ev: number;
}

export interface RewardRow {
  zone: BountyZone;
  difficulty: BountyDifficulty;
  /** 지금 보상 */
  reward: number;
  /** 지금 보상이 구역 대표 EV 몇 시간어치인가 */
  hours: number;
  targetHours: number;
  /** 목표와의 시간 차(양수는 지금 보상이 목표보다 크다) */
  gap: number;
  /** 목표에 맞춘 새 보상 */
  next: number;
  /** 새 보상 ÷ 지금 보상 - 1 */
  change: number;
}

/** 인접한 두 해역의 딱렙 방치 EV 증가율 */
export interface GrowthRow {
  from: SpotId; to: SpotId;
  fromEv: number; toEv: number;
  /** 뒤 딱렙 EV ÷ 앞 딱렙 EV - 1 */
  growth: number;
  /** 요구 파워 간격과 진입 레벨 간격 */
  powerGap: number; levelGap: number;
}

export interface EvReport { spots: SpotEv[]; zones: ZoneEv[]; rewards: RewardRow[]; growth?: GrowthRow[] }

export interface EvOptions {
  /** 해역 사이 딱렙 방치 EV 증가율 열을 더한다 */
  growth?: boolean;
}

export function evReport(o: EvOptions = {}): EvReport {
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
    const last = spotsOfZone(zone).at(-1)!;
    return { zone, ev: idleEv(last.id, entryLevel(last.id)) };
  });
  const rewards: RewardRow[] = [];
  for (const z of zones) {
    for (const difficulty of ['easy', 'normal', 'hard', 'named'] as const) {
      const quests = BOUNTIES.filter(q => q.zone === z.zone && q.difficulty === difficulty);
      if (quests.length === 0) continue;
      const reward = quests.reduce((a, q) => a + q.reward, 0) / quests.length;
      const targetHours = difficulty === 'named' ? NAMED_TARGET_HOURS : GENERAL_TARGET_HOURS[difficulty];
      const hours = reward / z.ev;
      const next = roundReward(targetHours * z.ev);
      rewards.push({ zone: z.zone, difficulty, reward, hours, targetHours, gap: hours - targetHours, next, change: next / reward - 1 });
    }
  }
  if (!o.growth) return { spots, zones, rewards };
  const growth: GrowthRow[] = spots.slice(1).map((b, i) => {
    const a = spots[i];
    return {
      from: a.spot, to: b.spot, fromEv: a.entryEv, toEv: b.entryEv, growth: b.entryEv / a.entryEv - 1,
      powerGap: (SPOTS[i + 1].powerReq ?? 0) - (SPOTS[i].powerReq ?? 0), levelGap: b.entryLevel - a.entryLevel,
    };
  });
  return { spots, zones, rewards, growth };
}
