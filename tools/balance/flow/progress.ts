// 진행 시뮬레이션 — 새 계정이 열린 가장 뒤 해역에서 낚고, 다음 해역에 필요한 배와 강화를 살 수 있으면 바로 사서 옮긴다.
// 플레이 유형마다 하루에 낚는 시간이 다르고, 선택하면 하루 의뢰와 네임드 토벌을 더한다.
// 가정: 판매는 즉시이고 이동·판매 왕복·미끼·유물·쿠폰은 없다. 명성을 기다리는 동안은 다음 해역 진입 레벨을 넘겨 강화하지 않고 골드를 쌓는다.
//       깨어 있는 시간에는 가방 한도를 보지 않고(자주 판다), 잠든 시간은 방치로 가방이 찰 때까지만 센다.
//       게임 날짜 경계(04:00)는 하루의 시작으로 보고, 하루 안의 순서는 의뢰, 일반 낚시, 잠든 낚시다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { BOATS } from '../../../src/game/content/boats';
import { capOfBoat, mutationWeightsOf, variantShare } from '../../../src/game/rules/logic';
import { powerOfLevel } from '../../../src/game/rules/stats';
import { upgradeCost } from '../../../src/game/rules/balance';
import { axisAvailable, rates, rodSpec } from '../model';
import type { Axis, Rates } from '../model';
import { licenseHeld, planBounties } from './bounty';
import type { Activity, DexLog } from './bounty';

export interface PlayType {
  id: 'h16' | 'h8' | 'h4' | 'h2' | 'always';
  label: string;
  /** 깨어서 실제로 낚는 시간(하루, 시간) */
  awakeHours: number;
  /** 잠든 동안 방치로 낚는 시간(하루, 시간). 가방이 차면 멈춘다 */
  sleepHours: number;
}

/** 4시간 유형에서 접속해 있어도 실제로 낚지 못하는 비율(%) 기본값 */
export const DEFAULT_LOSS4H = 25;

/** 하루 내내 쉬지 않고 낚는 가정 — 연속 방치 소요 시간을 잴 때 쓴다 */
export const ALWAYS_ON: PlayType = { id: 'always', label: '연속 방치', awakeHours: 24, sleepHours: 0 };

/** 하루 접속 시간 가정 네 가지 */
export function playTypes(loss4h: number = DEFAULT_LOSS4H): PlayType[] {
  if (!Number.isFinite(loss4h) || loss4h < 0 || loss4h > 100) throw new Error('낚지 못하는 비율은 0에서 100 사이여야 합니다');
  return [
    { id: 'h16', label: '16시간', awakeHours: 8, sleepHours: 8 },
    { id: 'h8', label: '8시간', awakeHours: 8, sleepHours: 0 },
    { id: 'h4', label: `4시간(낚시 ${100 - loss4h}%)`, awakeHours: 4 * (1 - loss4h / 100), sleepHours: 0 },
    { id: 'h2', label: '2시간', awakeHours: 2, sleepHours: 0 },
  ];
}

/** 잠든 동안 수입으로 세는 시간(초) — 시간당 캐치 수로 가방이 차는 시간까지만이다 */
export function sleepFishSeconds(boat: number, catchesPerHour: number, sleepSec: number): number {
  return Math.min(sleepSec, capOfBoat(boat) / catchesPerHour * 3600);
}

export interface SimOptions {
  type: PlayType;
  /** 깨어 있는 동안의 낚시 방식 — 방치 또는 수동(GOOD) */
  axis: 'idle' | 'manual';
  /** 하루 의뢰와 네임드 토벌을 수행하는가 */
  bounty: boolean;
  maxDays: number;
}

export interface Arrival {
  spot: SpotId;
  /** 도착한 날(첫날이 1) */
  day: number;
  /** 도착까지 누적 낚시 시간(시간) */
  hours: number;
  /** 직전 도착 이후 기다린 낚시 시간(시간) — 골드만, 명성만, 둘 다 모자란 시간 */
  waitGold: number; waitFame: number; waitBoth: number;
}

export interface SimResult {
  arrivals: Arrival[];
  /** 마지막 해역까지 도착했는가 */
  complete: boolean;
  /** 의뢰와 토벌로 번 골드의 합 */
  bountyGold: number;
}

const STEP_SEC = 60;
const LAST = SPOTS.length - 1;

/** 해역 열림 조건 — 배 단계와 낚싯대 파워 */
const opens = (spot: (typeof SPOTS)[number], boat: number, level: number) =>
  boat >= spot.boatTier && powerOfLevel(level) >= (spot.powerReq ?? 0);

const nextBoat = (boat: number) => BOATS.find(b => b.tier === boat + 1);

export function simulate(opts: SimOptions): SimResult {
  let gold = 0, fame = 0, level = 1, boat = 0, idx = 0, day = 1, fishSec = 0, bountyGold = 0;
  let waitGold = 0, waitFame = 0, waitBoth = 0;
  const arrivals: Arrival[] = [{ spot: SPOTS[0].id, day: 1, hours: 0, waitGold: 0, waitFame: 0, waitBoth: 0 }];
  const dex: DexLog = new Map();
  const cache = new Map<string, Rates>();
  const normalShare = new Map<SpotId, number>();

  const axisAt = (spot: SpotId, lv: number): Axis =>
    opts.axis === 'idle' ? 'idle' : axisAvailable(rodSpec(spot, lv), 'good') ? 'good' : 'normal';
  const rateAt = (spot: SpotId, axis: Axis = axisAt(spot, level)): Rates => {
    const key = `${spot}:${level}:${axis}`;
    let r = cache.get(key);
    if (!r) { r = rates(spot, level, axis); cache.set(key, r); }
    return r;
  };

  /** 낚은 캐치의 도감 기록 — 일반 폼을 한 번도 못 잡을 확률의 로그를 쌓는다 */
  const track = (spot: SpotId, r: Rates, catches: number) => {
    if (!opts.bounty) return;
    let share = normalShare.get(spot);
    if (share === undefined) { share = 1 - variantShare(mutationWeightsOf({ artifacts: [] }, spot)); normalShare.set(spot, share); }
    for (const row of r.rows) {
      const p = row.prob * share;
      if (p > 0) dex.set(row.fish.id, (dex.get(row.fish.id) ?? 0) + catches * Math.log1p(-p));
    }
  };

  const accrue = (spots: SpotId[], axis: Axis | null, sec: number) => {
    for (const spot of spots) {
      const r = rateAt(spot, axis ?? axisAt(spot, level));
      const h = sec / 3600 / spots.length;
      gold += r.goldPerHour * h; fame += r.famePerHour * h;
      track(spot, r, r.catchesPerHour * h);
    }
    fishSec += sec;
  };

  /** 필요한 배와 강화를 사고 열린 해역으로 옮긴다. 못 옮겼으면 무엇이 모자랐는지 dt초를 센다 */
  const settle = (dt: number) => {
    while (idx < LAST) {
      const next = SPOTS[idx + 1];
      let bought = true;
      while (bought) {
        bought = false;
        const need = next.boatTier > boat ? nextBoat(boat) : undefined;
        if (need && gold >= need.price && fame >= need.fameReq) { gold -= need.price; boat = need.tier; bought = true; }
        if (powerOfLevel(level) < (next.powerReq ?? 0) && gold >= upgradeCost(level)) { gold -= upgradeCost(level); level += 1; bought = true; }
      }
      if (opens(next, boat, level)) {
        idx += 1;
        arrivals.push({ spot: next.id, day, hours: fishSec / 3600, waitGold: waitGold / 3600, waitFame: waitFame / 3600, waitBoth: waitBoth / 3600 });
        waitGold = waitFame = waitBoth = 0;
        continue;
      }
      const boatLeft = boat < next.boatTier ? nextBoat(boat) : undefined;
      let goldNeed = boatLeft?.price ?? 0;
      for (let lv = level; powerOfLevel(lv) < (next.powerReq ?? 0); lv++) goldNeed += upgradeCost(lv);
      const goldShort = gold < goldNeed, fameShort = !!boatLeft && fame < boatLeft.fameReq;
      if (goldShort && fameShort) waitBoth += dt; else if (fameShort) waitFame += dt; else waitGold += dt;
      return;
    }
  };

  const fishFor = (spots: SpotId[] | null, axis: Axis | null, seconds: number) => {
    for (let left = seconds; left > 1e-9 && idx < LAST;) {
      const dt = Math.min(STEP_SEC, left);
      accrue(spots ?? [SPOTS[idx].id], axis, dt);
      left -= dt;
      settle(dt);
    }
  };

  const runActivity = (a: Activity) => {
    fishFor(a.spots, null, a.seconds);
    gold += a.lump; bountyGold += a.lump;
    settle(0);
  };

  for (; day <= opts.maxDays && idx < LAST; day++) {
    settle(0);
    let awake = opts.type.awakeHours * 3600;
    if (opts.bounty && idx < LAST) {
      const spot = SPOTS[idx].id;
      const plan = planBounties({
        player: { boat, level }, current: rateAt(spot), rateAt: s => rateAt(s),
        licensed: (zone, tier) => licenseHeld(dex, zone, tier), seconds: awake,
      });
      for (const a of plan) { runActivity(a); awake -= a.seconds; }
    }
    if (idx < LAST) fishFor(null, null, awake);
    const sleep = opts.type.sleepHours * 3600;
    if (sleep > 0 && idx < LAST) {
      const spot = SPOTS[idx].id;
      accrue([spot], 'idle', sleepFishSeconds(boat, rateAt(spot, 'idle').catchesPerHour, sleep));
    }
  }
  return { arrivals, complete: idx >= LAST, bountyGold };
}
