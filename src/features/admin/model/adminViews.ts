import { BOATS, boatNameOf } from '../../../game/content/boats';
import type {
  AdminEconomyRow, AdminEventRow, AdminSpamFlagRow, AdminUserRow,
} from './types';
import { REGION_ORDER } from './regions';

/** DB 숫자 열은 number·string·null 어느 형태로도 올 수 있다. */
export const adminNumber = (value: number | string | null): number =>
  value === null ? NaN : Number(value);

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
    sum + Number(row.sell_gold) + Number(row.coupon_gold) + Number(row.mail_gold), 0);
  const outflowTotal = economy.reduce((sum, row) =>
    sum + Number(row.rod_cost) + Number(row.boat_cost) + Number(row.bait_cost), 0);
  return { goldStats, goldSum, inflowTotal, outflowTotal };
}

/** 관리자 화면이 계정을 가리킬 때 보이는 식별 정보. 명부 행이 그대로 이 모양이다. 게스트의 email은 null이다 */
export type AdminIdentity = Pick<AdminUserRow, 'user_id' | 'email' | 'nickname' | 'is_anonymous'>;

/** 계정 표시 이름 "닉네임(이메일)". 게스트는 이메일 대신 게스트, 닉네임이 없으면 이름 없음, 이메일을 모르면 —이다 */
export function adminUserLabel(user: AdminIdentity): string {
  const contact = user.is_anonymous === true ? '게스트' : user.email ?? '—';
  return `${user.nickname ?? '이름 없음'}(${contact})`;
}

/** 짧은 계정 id(앞 8자리) */
export const shortUid = (uid: string): string => uid.slice(0, 8);

/** 명부로 uid의 식별 정보를 찾는 함수를 만든다. uid는 대소문자를 구분하지 않고, 명부에 없으면 uid만 있는 식별 정보다 */
export function adminIdentityLookup(users: readonly AdminIdentity[]): (uid: string) => AdminIdentity {
  const byUid = new Map(users.map(user => [user.user_id.toLowerCase(), user]));
  return uid => byUid.get(uid.toLowerCase()) ?? { user_id: uid, nickname: null, email: null, is_anonymous: null };
}

/** 사용자 명부 검색을 계정 id·이메일·닉네임의 대소문자 구분 없는 부분 일치로 처리한다. */
export function filterAdminUsers(users: readonly AdminUserRow[], query: string): AdminUserRow[] {
  const normalized = query.trim().toLowerCase();
  return users.filter(user => !normalized || user.user_id.toLowerCase().includes(normalized)
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
