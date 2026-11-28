import { BOATS, boatNameOf } from '../../../game/content/boats';
import { boatFameGateOf } from '../../../game/rules/rules';
import type {
  AdminEconomyRow, AdminEventRow, AdminSpamFlagRow, AdminUserAggregates, AdminUserRow,
} from './types';
import { percentile } from './metrics';
import { OPEN_WORLD_ZONE_UNLOCKS, REGION_ORDER } from './regions';

/** DB 숫자 열은 number·string·null 어느 형태로도 올 수 있다. */
export const adminNumber = (value: number | string | null): number =>
  value === null ? NaN : Number(value);

/** 배 단계 번호를 한글 배 이름으로 바꾼다 (표현 계층 공용) */
export const adminBoatName = (boat: number): string => boatNameOf(boat);

export interface RiskSignals {
  restrictedCount: number;
  spamUsers: number;
  riskTotal: number;
}

/** 개요 탭의 위험 신호(제재 계정, 연타 플래그 사용자) 수를 센다. */
export function selectRiskSignals(
  users: readonly AdminUserRow[], flags: readonly AdminSpamFlagRow[],
): RiskSignals {
  const restrictedCount = users.filter(user => user.restricted === true).length;
  const spamUsers = flags.reduce((count, flag) => count + (flag.fast_gap_7d > 0 ? 1 : 0), 0);
  return { restrictedCount, spamUsers, riskTotal: restrictedCount + spamUsers };
}

export interface ProgressionDashboard {
  totalUsers: number;
  activePlayers: number;
  dormantGuests: number;
  boatHist: {
    values: number[];
    labels: string[];
    legend: Array<{ name: string; count: number }>;
  };
  rodHist: { values: number[]; labels: string[]; min: number };
  regionReach: Array<{ id: string; users: number; sharePercent: number }>;
  zoneUnlocks: Array<{
    id: string;
    name: string;
    fullName: string;
    entryBoat: number;
    hasBounty: boolean;
    users: number;
    sharePercent: number;
  }>;
  stalled: Array<{ user: AdminUserRow; next: (typeof BOATS)[number]; deficit: number }>;
  stalledSummary: {
    total: number;
    byNextTier: Array<{ nextTier: number; name: string; fameReq: number; count: number }>;
  };
}

const buildBoatHist = (buckets: number[]): ProgressionDashboard['boatHist'] => ({
  values: buckets,
  labels: buckets.map((_, tier) => (tier === 0 ? '맨발' : `T${tier}`)),
  legend: buckets.map((count, tier) => ({
    name: tier === 0 ? '맨발' : `${tier} ${boatNameOf(tier)}`,
    count,
  })),
});

const buildRodHistFromCounts = (entries: ReadonlyArray<{ level: number; count: number }>): ProgressionDashboard['rodHist'] => {
  const valid = entries.filter(entry => entry.level >= 1 && entry.count > 0);
  if (valid.length === 0) return { values: [], labels: [], min: 1 };
  const byLevel = new Map(valid.map(entry => [entry.level, entry.count]));
  const min = Math.min(...valid.map(entry => entry.level));
  const max = Math.max(...valid.map(entry => entry.level));
  const values: number[] = [];
  for (let level = min; level <= max; level++) {
    values.push(byLevel.get(level) ?? 0);
  }
  return { values, labels: values.map((_, index) => `${min + index}`), min };
};

/** 배·낚싯대·지역 분포와 다음 배 명성 게이트 정체 데이터를 만든다. 사전 집계가 있으면 분포·도달·게이트 총합을 집계에서 읽는다. */
export function selectProgressionDashboard(
  users: readonly AdminUserRow[],
  aggregates?: AdminUserAggregates | null,
): ProgressionDashboard {
  const stalled: ProgressionDashboard['stalled'] = [];
  for (const user of users) {
    const gate = boatFameGateOf(user.boat ?? 0, adminNumber(user.fame));
    if (!gate) continue;
    stalled.push({ user, next: gate.next, deficit: gate.deficit });
  }
  stalled.sort((a, b) => b.deficit - a.deficit);

  if (aggregates) {
    const activePlayers = aggregates.activePlayers;
    const totalUsers = aggregates.totalUsers;
    const boatMap = new Map(aggregates.progression.boats.map(b => [b.tier, b.count]));
    const boatBuckets = Array.from({ length: BOATS.length + 1 }, (_, tier) => boatMap.get(tier) ?? 0);
    const reachMap = new Map(aggregates.progression.regionReach.map(r => [r.id, r.count]));
    const unlockMap = new Map(aggregates.progression.zoneUnlocks.map(z => [z.id, z.count]));

    return {
      totalUsers,
      activePlayers,
      dormantGuests: Math.max(0, totalUsers - activePlayers),
      boatHist: buildBoatHist(boatBuckets),
      rodHist: buildRodHistFromCounts(aggregates.progression.rods),
      regionReach: REGION_ORDER.map(id => {
        const visitedUsers = reachMap.get(id) ?? 0;
        return {
          id,
          users: visitedUsers,
          sharePercent: activePlayers === 0 ? 0 : visitedUsers / activePlayers * 100,
        };
      }),
      zoneUnlocks: OPEN_WORLD_ZONE_UNLOCKS.map(z => {
        const unlockedUsers = unlockMap.get(z.id) ?? 0;
        return {
          id: z.id,
          name: z.name,
          fullName: z.fullName,
          entryBoat: z.entryBoat,
          hasBounty: z.hasBounty,
          users: unlockedUsers,
          sharePercent: activePlayers === 0 ? 0 : unlockedUsers / activePlayers * 100,
        };
      }),
      stalled,
      stalledSummary: {
        total: aggregates.progression.fameGateStalled.total,
        byNextTier: [...aggregates.progression.fameGateStalled.byNextTier]
          .sort((a, b) => a.nextTier - b.nextTier)
          .map(row => {
            const next = BOATS.find(boat => boat.tier === row.nextTier);
            return {
              nextTier: row.nextTier,
              name: next?.name ?? `T${row.nextTier}`,
              fameReq: next?.fameReq ?? 0,
              count: row.count,
            };
          }),
      },
    };
  }

  const buckets = Array.from({ length: BOATS.length + 1 }, (_, tier) =>
    users.filter(user => (user.boat ?? 0) === tier).length);
  const boatHist = buildBoatHist(buckets);

  const rodCounts = new Map<number, number>();
  for (const user of users) {
    const level = user.rod ?? 1;
    if (level >= 1) rodCounts.set(level, (rodCounts.get(level) ?? 0) + 1);
  }
  const rodHist = buildRodHistFromCounts(
    [...rodCounts.entries()].map(([level, count]) => ({ level, count })),
  );

  const regionReach = REGION_ORDER.map(id => {
    const visitedUsers = users.filter(user => (user.visited ?? []).includes(id)).length;
    return {
      id,
      users: visitedUsers,
      sharePercent: users.length === 0 ? 0 : visitedUsers / users.length * 100,
    };
  });
  const zoneUnlocks = OPEN_WORLD_ZONE_UNLOCKS.map(z => {
    const unlockedUsers = users.filter(user => (user.boat ?? 0) >= z.entryBoat).length;
    return {
      id: z.id,
      name: z.name,
      fullName: z.fullName,
      entryBoat: z.entryBoat,
      hasBounty: z.hasBounty,
      users: unlockedUsers,
      sharePercent: users.length === 0 ? 0 : unlockedUsers / users.length * 100,
    };
  });

  const byTierCounts = new Map<number, number>();
  for (const item of stalled) {
    byTierCounts.set(item.next.tier, (byTierCounts.get(item.next.tier) ?? 0) + 1);
  }
  const stalledSummary = {
    total: stalled.length,
    byNextTier: [...byTierCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([nextTier, count]) => {
        const next = BOATS.find(boat => boat.tier === nextTier);
        return { nextTier, name: next?.name ?? `T${nextTier}`, fameReq: next?.fameReq ?? 0, count };
      }),
  };

  return {
    totalUsers: users.length,
    activePlayers: users.length,
    dormantGuests: 0,
    boatHist,
    rodHist,
    regionReach,
    zoneUnlocks,
    stalled,
    stalledSummary,
  };
}

export interface AntiAbuseRows {
  spamUsers: AdminSpamFlagRow[];
  perfectOutliers: AdminSpamFlagRow[];
  restricted: AdminUserRow[];
}

/** 이상탐지 탭에서 정렬·필터하는 운영 자료를 만든다. */
export function selectAntiAbuseRows(
  users: readonly AdminUserRow[], flags: readonly AdminSpamFlagRow[],
): AntiAbuseRows {
  const spamUsers = flags.filter(flag => flag.fast_gap_7d > 0)
    .sort((a, b) => b.fast_gap_7d - a.fast_gap_7d);
  const globalPct = flags[0]?.perfect_pct_global ?? null;
  const perfectOutliers = globalPct === null ? [] : flags
    .filter(flag => flag.catches_7d >= 20 && (flag.perfect_pct ?? 0) > globalPct + 40)
    .sort((a, b) => (b.perfect_pct ?? 0) - (a.perfect_pct ?? 0));
  const restricted = users.filter(user => user.restricted === true);
  return { spamUsers, perfectOutliers, restricted };
}

export interface EconomyMetrics {
  goldStats: number[];
  goldCount: number;
  goldSum: number;
  goldMedian: number;
  goldP75: number;
  goldMax: number;
  inflowTotal: number;
  outflowTotal: number;
}

/** 잔고 분포와 원장 입출 합계를 계산한다. 사전 집계가 있으면 비식별 명부 대신 집계값을 우선 쓴다. */
export function selectEconomyMetrics(
  users: readonly AdminUserRow[],
  economy: readonly AdminEconomyRow[],
  aggregates?: AdminUserAggregates | null,
): EconomyMetrics {
  const inflowTotal = economy.reduce((sum, row) =>
    sum + Number(row.sell_gold) + Number(row.coupon_gold) + Number(row.mail_gold)
      + Number(row.bounty_gold) + Number(row.achievement_gold), 0);
  const outflowTotal = economy.reduce((sum, row) =>
    sum + Number(row.rod_cost) + Number(row.boat_cost) + Number(row.hat_cost), 0);

  if (aggregates) {
    const { count, sum, median, p75, max } = aggregates.gold;
    return {
      goldStats: [],
      goldCount: count,
      goldSum: sum,
      goldMedian: median ?? NaN,
      goldP75: p75 ?? NaN,
      goldMax: max ?? NaN,
      inflowTotal,
      outflowTotal,
    };
  }

  const goldStats = users.map(user => adminNumber(user.gold))
    .filter(Number.isFinite).sort((a, b) => a - b);
  const goldSum = goldStats.reduce((sum, value) => sum + value, 0);
  return {
    goldStats,
    goldCount: goldStats.length,
    goldSum,
    goldMedian: percentile(goldStats, 50),
    goldP75: percentile(goldStats, 75),
    goldMax: goldStats[goldStats.length - 1] ?? NaN,
    inflowTotal,
    outflowTotal,
  };
}

/** 관리자 화면이 계정을 가리킬 때 보이는 식별 정보. 명부 행이 그대로 이 모양이다. 게스트의 email은 null이다 */
export type AdminIdentity = Pick<AdminUserRow, 'user_id' | 'opHandle' | 'email' | 'nickname' | 'is_anonymous'>;

/** 계정 표시 이름 "닉네임(이메일)". 비식별 투영(maintainer)은 이메일 없이 닉네임만 보이고, 게스트는 (게스트)만 붙인다 */
export function adminUserLabel(user: AdminIdentity): string {
  const name = user.nickname ?? '이름 없음';
  if (user.opHandle) return user.is_anonymous === true ? `${name}(게스트)` : name;
  if (!user.email && user.is_anonymous === false) return name;
  const contact = user.is_anonymous === true ? '게스트' : user.email ?? '—';
  return `${name}(${contact})`;
}

/** 짧은 계정 id(앞 8자리) */
export const shortUid = (uid: string): string => uid.slice(0, 8);

/** 명부로 uid의 식별 정보를 찾는 함수를 만든다. uid는 대소문자를 구분하지 않고, 명부에 없으면 uid만 있는 식별 정보다 */
export function adminIdentityLookup(users: readonly AdminIdentity[]): (uid: string) => AdminIdentity {
  const byUid = new Map<string, AdminIdentity>();
  for (const user of users) {
    byUid.set(user.user_id.toLowerCase(), user);
    if (user.opHandle) byUid.set(user.opHandle.toLowerCase(), user);
  }
  return uid => byUid.get(uid.toLowerCase()) ?? { user_id: uid, nickname: null, email: null, is_anonymous: null };
}

/**
 * 휴면 게스트 여부. 진행이 없는 게스트(저장이 없거나 골드와 명성이 모두 0)이고 제재되지 않은 계정이다.
 * 저장 상태만으로 정하므로 그 계정이 진행을 시작하면 별도 처리 없이 휴면에서 벗어난다.
 * 계정 유저와 제재된 계정은 관리 대상이라 진행이 없어도 휴면으로 보지 않는다.
 */
export function isDormantGuest(user: AdminUserRow): boolean {
  if (user.is_anonymous !== true || user.restricted === true) return false;
  // 저장이 없는 계정은 골드와 명성 열이 null이다
  return (user.gold === null || adminNumber(user.gold) === 0)
    && (user.fame === null || adminNumber(user.fame) === 0);
}

/** 명부를 활동 계정과 휴면 게스트로 나눈다. 각 목록은 입력 순서를 유지한다 */
export function splitDormantGuests(users: readonly AdminUserRow[]): { active: AdminUserRow[]; dormant: AdminUserRow[] } {
  const active: AdminUserRow[] = [];
  const dormant: AdminUserRow[] = [];
  for (const user of users) (isDormantGuest(user) ? dormant : active).push(user);
  return { active, dormant };
}

/** 사용자 명부 검색을 계정 id·불투명 핸들·이메일·닉네임의 대소문자 구분 없는 부분 일치로 처리한다. */
export function filterAdminUsers(users: readonly AdminUserRow[], query: string): AdminUserRow[] {
  const normalized = query.trim().toLowerCase();
  return users.filter(user => !normalized || user.user_id.toLowerCase().includes(normalized)
    || (user.opHandle ?? '').toLowerCase().includes(normalized)
    || (user.email ?? '').toLowerCase().includes(normalized)
    || (user.nickname ?? '').toLowerCase().includes(normalized));
}

export interface AdminUserDetailData {
  flag: AdminSpamFlagRow | null;
  byType: Array<[string, number]>;
  fastGaps: Set<number>;
}

/** 한 사용자 감사 창의 이벤트 집계·연타 인덱스와 연타·판정 플래그를 추린다. */
export function selectAdminUserDetail(
  userId: string, events: readonly AdminEventRow[], flags: readonly AdminSpamFlagRow[],
): AdminUserDetailData {
  const byTypeCounts = new Map<string, number>();
  for (const event of events) {
    byTypeCounts.set(event.type, (byTypeCounts.get(event.type) ?? 0) + 1);
  }
  const fastGaps = new Set<number>();
  let lastCatch: AdminEventRow | null = null;
  events.forEach((event, index) => {
    if (event.type !== 'catch') return;
    if (lastCatch && (Date.parse(event.created_at) - Date.parse(lastCatch.created_at)) / 1000 < 2) {
      fastGaps.add(index);
    }
    lastCatch = event;
  });
  return {
    flag: flags.find(row => row.user_id === userId) ?? null,
    byType: [...byTypeCounts.entries()].sort((a, b) => b[1] - a[1]),
    fastGaps,
  };
}
