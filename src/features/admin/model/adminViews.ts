import { BOATS, boatNameOf } from '../../../game/content/boats';
import type {
  AdminCatchQualityRow, AdminEconomyRow, AdminEventRow, AdminDexMismatchRow,
  AdminImportLogRow, AdminSpamFlagRow, AdminUserRow,
} from './types';
import { REGION_NAMES, REGION_ORDER, toRegionId } from './regions';

export const ONLINE_WINDOW_MIN = 10;

/** DB 숫자 열은 number·string·null 어느 형태로도 올 수 있다. */
export const adminNumber = (value: number | string | null): number =>
  value === null ? NaN : Number(value);

export interface OverviewMetrics {
  catch7d: number;
  restrictedCount: number;
  spamUsers: number;
  riskTotal: number;
  goldTotal: number;
  fameTotal: number;
}

/** 개요 탭의 KPI와 위험 수를 원본 행에서 계산한다. */
export function selectOverviewMetrics(
  users: readonly AdminUserRow[], flags: readonly AdminSpamFlagRow[],
  imports: readonly AdminImportLogRow[], quality: readonly AdminCatchQualityRow[],
): OverviewMetrics {
  const catch7d = quality.slice(0, 7).reduce((sum, row) => sum + row.catches, 0);
  const restrictedCount = users.filter(user => user.restricted === true).length;
  const spamUsers = flags.reduce((count, flag) => count + (flag.fast_gap_7d > 0 ? 1 : 0), 0);
  return {
    catch7d,
    restrictedCount,
    spamUsers,
    riskTotal: restrictedCount + spamUsers + imports.length,
    goldTotal: users.reduce((sum, user) => sum + adminNumber(user.gold), 0),
    fameTotal: users.reduce((sum, user) => sum + adminNumber(user.fame), 0),
  };
}

export interface ProgressionDashboard {
  boatHist: {
    values: number[];
    labels: string[];
    legend: Array<{ name: string; count: number }>;
  };
  rodHist: { values: number[]; labels: string[]; min: number };
  regionReach: Array<{ id: string; users: number; sharePercent: number }>;
  stalled: Array<{ user: AdminUserRow; next: (typeof BOATS)[number]; deficit: number }>;
}

/** 배·낚싯대·지역 분포와 다음 배 명성 게이트 정체 데이터를 만든다. */
export function selectProgressionDashboard(users: readonly AdminUserRow[]): ProgressionDashboard {
  const buckets = Array.from({ length: BOATS.length + 1 }, (_, tier) =>
    users.filter(user => (user.boat ?? 0) === tier).length);
  const boatHist = {
    values: buckets,
    labels: buckets.map((_, tier) => tier === 0 ? '맨발' : `T${tier}`),
    legend: buckets.map((count, tier) => ({
      name: tier === 0 ? '맨발' : `${tier} ${boatNameOf(tier)}`,
      count,
    })),
  };

  const rods = users.map(user => user.rod ?? 1).filter(level => level >= 1);
  let rodHist: ProgressionDashboard['rodHist'];
  if (rods.length === 0) {
    rodHist = { values: [], labels: [], min: 1 };
  } else {
    const min = Math.min(...rods);
    const max = Math.max(...rods);
    const values: number[] = [];
    for (let level = min; level <= max; level++) {
      values.push(rods.filter(rod => rod === level).length);
    }
    rodHist = { values, labels: values.map((_, index) => `${min + index}`), min };
  }

  const regionReach = REGION_ORDER.map(id => {
    const visitedUsers = users.filter(user => (user.visited ?? []).includes(id)).length;
    return {
      id,
      users: visitedUsers,
      sharePercent: users.length === 0 ? 0 : visitedUsers / users.length * 100,
    };
  });
  const stalled: ProgressionDashboard['stalled'] = [];
  for (const user of users) {
    const next = BOATS.find(boat => boat.tier === (user.boat ?? 0) + 1);
    if (!next) continue;
    const fame = adminNumber(user.fame);
    if (!(fame < next.fameReq)) continue;
    stalled.push({ user, next, deficit: next.fameReq - fame });
  }

  return {
    boatHist,
    rodHist,
    regionReach,
    stalled: stalled.sort((a, b) => b.deficit - a.deficit),
  };
}

export interface LiveDashboard {
  buckets: { online: AdminUserRow[]; recent1h: AdminUserRow[]; today: AdminUserRow[] };
  whereHist: { values: number[]; labels: string[] };
  regionLabel: (user: AdminUserRow) => string | undefined;
}

/** 마지막 행동 시각으로 접속 신선도 구간과 온라인 위치 분포를 만든다. */
export function selectLiveDashboard(users: readonly AdminUserRow[], nowMs: number): LiveDashboard {
  const freshness = (user: AdminUserRow): number | null => {
    const time = user.last_action_at ? Date.parse(user.last_action_at) : NaN;
    return Number.isFinite(time) ? (nowMs - time) / 60_000 : null;
  };
  const online = users.filter(user => {
    const minutes = freshness(user);
    return minutes !== null && minutes < ONLINE_WINDOW_MIN;
  });
  const recent1h = users.filter(user => {
    const minutes = freshness(user);
    return minutes !== null && minutes < 60;
  });
  const today = users.filter(user => {
    const minutes = freshness(user);
    return minutes !== null && minutes < 24 * 60;
  });
  const labels = [...REGION_ORDER.map(id => REGION_NAMES[id]), '기타'];
  const values = new Array(labels.length).fill(0) as number[];
  for (const user of online) {
    const region = toRegionId(user.location_kind, user.location_id);
    const index = region ? REGION_ORDER.findIndex(id => id === region) : -1;
    values[index >= 0 ? index : labels.length - 1]++;
  }
  const regionLabel = (user: AdminUserRow): string | undefined => {
    const region = toRegionId(user.location_kind, user.location_id);
    return region ? REGION_NAMES[region] : undefined;
  };
  return { buckets: { online, recent1h, today }, whereHist: { values, labels }, regionLabel };
}

export interface AntiAbuseRows {
  spamUsers: AdminSpamFlagRow[];
  perfectOutliers: AdminSpamFlagRow[];
  topMismatch: AdminDexMismatchRow[];
  restricted: AdminUserRow[];
}

/** 이상탐지 탭에서 정렬·필터하는 운영 자료를 만든다. */
export function selectAntiAbuseRows(
  users: readonly AdminUserRow[], flags: readonly AdminSpamFlagRow[],
  mismatch: readonly AdminDexMismatchRow[],
): AntiAbuseRows {
  const spamUsers = flags.filter(flag => flag.fast_gap_7d > 0)
    .sort((a, b) => b.fast_gap_7d - a.fast_gap_7d);
  const globalPct = flags[0]?.perfect_pct_global ?? null;
  const perfectOutliers = globalPct === null ? [] : flags
    .filter(flag => flag.catches_7d >= 20 && (flag.perfect_pct ?? 0) > globalPct + 40)
    .sort((a, b) => (b.perfect_pct ?? 0) - (a.perfect_pct ?? 0));
  const topMismatch = [...mismatch]
    .sort((a, b) => b.missing_events - a.missing_events)
    .slice(0, 15);
  const restricted = users.filter(user => user.restricted === true);
  return { spamUsers, perfectOutliers, topMismatch, restricted };
}

export interface EconomyMetrics {
  goldStats: number[];
  goldSum: number;
  inflowTotal: number;
  outflowTotal: number;
}

/** 잔고 분포와 원장 입출 합계를 계산한다. */
export function selectEconomyMetrics(
  users: readonly AdminUserRow[], economy: readonly AdminEconomyRow[],
): EconomyMetrics {
  const goldStats = users.map(user => adminNumber(user.gold))
    .filter(Number.isFinite).sort((a, b) => a - b);
  const goldSum = goldStats.reduce((sum, value) => sum + value, 0);
  const inflowTotal = economy.reduce((sum, row) =>
    sum + Number(row.sell_gold) + Number(row.coupon_gold), 0);
  const outflowTotal = economy.reduce((sum, row) =>
    sum + Number(row.rod_cost) + Number(row.boat_cost) + Number(row.bait_cost), 0);
  return { goldStats, goldSum, inflowTotal, outflowTotal };
}

/** 사용자 명부 검색을 대소문자 구분 없는 부분 일치로 처리한다. */
export function filterAdminUsers(users: readonly AdminUserRow[], query: string): AdminUserRow[] {
  const normalized = query.trim().toLowerCase();
  return users.filter(user => !normalized || user.user_id.toLowerCase().includes(normalized)
    || (user.email ?? '').toLowerCase().includes(normalized));
}

export interface AdminUserDetailData {
  mismatch: AdminDexMismatchRow[];
  flag: AdminSpamFlagRow | null;
  imports: AdminImportLogRow[];
  byType: Array<[string, number]>;
  fastGaps: Set<number>;
}

/** 한 사용자 감사 창의 이벤트 집계·연타 인덱스와 관련 레코드를 추린다. */
export function selectAdminUserDetail(
  userId: string, events: readonly AdminEventRow[], mismatch: readonly AdminDexMismatchRow[],
  flags: readonly AdminSpamFlagRow[], imports: readonly AdminImportLogRow[],
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
    mismatch: mismatch.filter(row => row.user_id === userId),
    flag: flags.find(row => row.user_id === userId) ?? null,
    imports: imports.filter(row => row.user_id === userId),
    byType: [...byTypeCounts.entries()].sort((a, b) => b[1] - a[1]),
    fastGaps,
  };
}
