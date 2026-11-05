// 운영 지표 파생 — 일별 집계·접속 세션·실시간 접속·코호트 리텐션을 화면이 그대로 그릴 값으로 바꾼다.
// 날짜는 서버 집계와 같은 KST 하루 기준이다.
import { zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';
import { REGION_NAMES } from './regions';
import type {
  AdminDailyStatsRow, AdminLive, AdminRetentionRow, AdminSessionRow, AdminUserRow,
} from './types';

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

/** 시각(ms) → KST 날짜(yyyy-mm-dd) */
export const kstDayOfMs = (ms: number): string => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);

/** 시각(ISO) → ms. 없거나 읽을 수 없으면 NaN */
const msOf = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);

// ---------- 시간 표기 ----------

/** 초 → '1시간 23분' · '4분' · '1분 미만' · '0분'. 값이 없거나 음수면 '—' */
export function fmtDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec < 0) return '—';
  if (sec === 0) return '0분';
  if (sec < 60) return '1분 미만';
  const minutes = Math.floor(sec / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/** 0~1 비율 → 정수 백분율. 아직 관측하지 않은 값(null)은 그대로 둔다 */
export const ratioPct = (ratio: number | null): number | null =>
  ratio === null || !Number.isFinite(ratio) ? null : Math.round(ratio * 100);

// ---------- 일별 집계 시계열 ----------

export interface DailySeries {
  /** 막대 이름(MM-DD) */
  labels: string[];
  /** 축에서 집계된 날 수. 나머지 날은 미집계다 */
  collected: number;
  dau: number[];
  sessions: number[];
  /** 그날 세션의 평균 길이(분). 세션이 없으면 0 */
  avgSessionMin: number[];
  catches: number[];
  goldIn: number[];
  goldOut: number[];
  newUsers: number[];
  newAccounts: number[];
}

/** 일별 집계 행을 날짜 축(오름차순)에 붙인다. 행이 없는 날(미집계)은 NaN이라 0과 구분된다 */
export function selectDailySeries(rows: readonly AdminDailyStatsRow[], days: readonly string[]): DailySeries {
  const byDay = new Map(rows.map(row => [row.day, row]));
  const axis = days.map(day => byDay.get(day));
  const pick = (value: (row: AdminDailyStatsRow) => number) => axis.map(row => (row ? value(row) : NaN));
  return {
    labels: days.map(day => day.slice(5)),
    collected: axis.filter(Boolean).length,
    dau: pick(row => row.dau),
    sessions: pick(row => row.sessions),
    avgSessionMin: pick(row => (row.sessions > 0 ? row.sessionMinutes / row.sessions : 0)),
    catches: pick(row => row.catches),
    goldIn: pick(row => row.goldIn),
    goldOut: pick(row => row.goldOut),
    newUsers: pick(row => row.newUsers),
    newAccounts: pick(row => row.newAccounts),
  };
}

// ---------- 개요 지표 ----------

/** 그 사람이 마지막으로 보인 시각 — 마지막 행동과 마지막 세션 종료 중 늦은 쪽(ms). 둘 다 없으면 NaN */
const lastSeenMs = (user: AdminUserRow): number => {
  const seen = [msOf(user.last_action_at), msOf(user.last_session_at)].filter(Number.isFinite);
  return seen.length > 0 ? Math.max(...seen) : NaN;
};

export interface ActiveUsers {
  /** 오늘(KST) 보인 사람 */
  today: number;
  /** 지금부터 7일(168시간) 안에 보인 사람 */
  week: number;
  /** 지금부터 30일 안에 보인 사람 */
  month: number;
}

/**
 * 고유 활성 사용자 수를 명부에서 센다. 일별 집계에는 고유 사용자 합집합이 없어서 WAU·MAU를 만들 수 없지만,
 * 명부의 마지막 활동 시각은 사람마다 하나라 "기간 안에 한 번이라도 보인 사람"을 정확히 센다.
 */
export function selectActiveUsers(users: readonly AdminUserRow[], nowMs: number): ActiveUsers {
  const today = kstDayOfMs(nowMs);
  let todayCount = 0, week = 0, month = 0;
  for (const user of users) {
    const seen = lastSeenMs(user);
    if (!Number.isFinite(seen)) continue;
    if (kstDayOfMs(seen) === today) todayCount++;
    if (nowMs - seen < 7 * DAY_MS) week++;
    if (nowMs - seen < 30 * DAY_MS) month++;
  }
  return { today: todayCount, week, month };
}

/** 오늘(KST) 처음 들어온 사람과 그중 가입 계정 수 — 명부의 최초 생성 시각 기준이다 */
export function selectNewToday(users: readonly AdminUserRow[], nowMs: number): { users: number; accounts: number } {
  const today = kstDayOfMs(nowMs);
  const fresh = users.filter(user => {
    const at = msOf(user.signed_up_at);
    return Number.isFinite(at) && kstDayOfMs(at) === today;
  });
  return { users: fresh.length, accounts: fresh.filter(user => user.is_anonymous === false).length };
}

/** 오늘(KST) 시작해 끝난 세션의 수와 평균 길이(초). 세션이 없으면 평균은 null */
export function selectTodaySessions(sessions: readonly AdminSessionRow[], nowMs: number): { count: number; avgSec: number | null } {
  const today = kstDayOfMs(nowMs);
  const todays = sessions.filter(session => {
    const at = msOf(session.startedAt);
    return Number.isFinite(at) && kstDayOfMs(at) === today;
  });
  const total = todays.reduce((sum, session) => sum + session.durationSec, 0);
  return { count: todays.length, avgSec: todays.length > 0 ? total / todays.length : null };
}

/** 리텐션 지표 하나 — 그 값이 정해진 가장 최근 코호트 */
export interface RetentionPoint { day: string; size: number; pct: number }

/** d1·d7 값이 정해진(null이 아닌) 가장 최근 가입일 코호트. 그런 코호트가 없으면 null */
export function latestRetention(rows: readonly AdminRetentionRow[], key: 'd1' | 'd7' | 'd30'): RetentionPoint | null {
  let best: AdminRetentionRow | null = null;
  for (const row of rows) {
    if (row[key] === null || row.size <= 0) continue;
    if (!best || row.day > best.day) best = row;
  }
  return best ? { day: best.day, size: best.size, pct: ratioPct(best[key]) ?? 0 } : null;
}

/** 코호트 표 — 최근 가입일부터 limit개, 비율은 정수 백분율(미관측은 null) */
export function selectRetentionTable(rows: readonly AdminRetentionRow[], limit: number): AdminRetentionRow[] {
  return [...rows].sort((a, b) => b.day.localeCompare(a.day)).slice(0, limit)
    .map(row => ({ ...row, d1: ratioPct(row.d1), d7: ratioPct(row.d7), d30: ratioPct(row.d30) }));
}

// ---------- 실시간 접속 ----------

/** 접속 위치 이름 — 마을은 '마을', 바다는 해역 이름, 해역을 모르면 지역 이름이다 */
export function placeName(region: string | null, zone: string | null): string {
  if (region === 'village') return REGION_NAMES.village;
  const zoneName = zone ? zoneById(zone as ZoneId)?.name : undefined;
  if (zoneName) return zoneName;
  return region ? (REGION_NAMES[region] ?? region) : '—';
}

export interface LiveRow {
  uid: string; nick: string; guest: boolean; place: string; connectedAt: string;
  /** 지금까지 연결된 시간(초) */
  connectedSec: number;
}

export interface LiveBoard {
  rows: LiveRow[];
  members: number;
  guests: number;
  /** 위치별 인원 — 많은 순 */
  places: { labels: string[]; values: number[] };
}

/** 실시간 접속 목록을 오래 연결된 순으로 놓고, 가입·게스트 수와 위치 분포를 센다 */
export function selectLiveBoard(live: AdminLive | null, nowMs: number): LiveBoard {
  const rows: LiveRow[] = (live?.online ?? []).map(entry => ({
    uid: entry.uid,
    nick: entry.nick,
    guest: entry.guest,
    place: placeName(entry.region, entry.zone),
    connectedAt: entry.connectedAt,
    connectedSec: Math.max(0, Math.floor((nowMs - msOf(entry.connectedAt)) / 1000)),
  })).sort((a, b) => b.connectedSec - a.connectedSec);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.place, (counts.get(row.place) ?? 0) + 1);
  const places = [...counts].sort((a, b) => b[1] - a[1]);
  const guests = rows.filter(row => row.guest).length;
  return {
    rows,
    members: rows.length - guests,
    guests,
    places: { labels: places.map(([name]) => name), values: places.map(([, count]) => count) },
  };
}
