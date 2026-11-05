import { describe, expect, it } from 'vitest';
import {
  fmtDuration, kstDayOfMs, latestRetention, placeName, ratioPct, selectActiveUsers, selectDailySeries,
  selectRetentionTable,
  selectLiveBoard, selectNewToday, selectTodaySessions,
} from './dashboard';
import type { AdminDailyStatsRow, AdminSessionRow, AdminUserRow } from './types';

const user = (overrides: Partial<AdminUserRow> = {}): AdminUserRow => ({
  user_id: 'user-1', email: null, nickname: null, is_anonymous: true, signed_up_at: null,
  last_sign_in_at: null, gold: 0, fame: 0, boat: 0, rod: 1,
  location_kind: null, location_id: null, visited: [], restricted: false,
  save_version: 8, last_action_at: null, last_session_at: null, total_session_sec: 0, ...overrides,
});

const stats = (day: string, overrides: Partial<AdminDailyStatsRow> = {}): AdminDailyStatsRow => ({
  day, dau: 0, newUsers: 0, newAccounts: 0, sessions: 0, sessionMinutes: 0, medianSessionMinutes: null,
  catches: 0, goldIn: 0, goldOut: 0, actions: 0, ...overrides,
});

const session = (startedAt: string, durationSec: number): AdminSessionRow => ({
  id: 1, userId: 'user-1', nick: null, startedAt, endedAt: startedAt, durationSec,
});

// 2026-11-05 12:00 KST
const NOW = Date.parse('2026-11-05T03:00:00Z');

describe('시간 표기', () => {
  it('시간과 분으로 적고, 1분이 안 되면 1분 미만이다', () => {
    expect(fmtDuration(83 * 60 + 59)).toBe('1시간 23분');
    expect(fmtDuration(4 * 60)).toBe('4분');
    expect(fmtDuration(2 * 3600)).toBe('2시간');
    expect(fmtDuration(125 * 3600 + 60)).toBe('125시간 1분');
    expect(fmtDuration(30)).toBe('1분 미만');
    expect(fmtDuration(0)).toBe('0분');
  });

  it('값이 없거나 읽을 수 없으면 대시다', () => {
    expect(fmtDuration(null)).toBe('—');
    expect(fmtDuration(undefined)).toBe('—');
    expect(fmtDuration(NaN)).toBe('—');
    expect(fmtDuration(-1)).toBe('—');
  });

  it('KST 날짜는 UTC 15시에 넘어간다', () => {
    expect(kstDayOfMs(Date.parse('2026-11-04T14:59:59Z'))).toBe('2026-11-04');
    expect(kstDayOfMs(Date.parse('2026-11-04T15:00:00Z'))).toBe('2026-11-05');
  });

  it('비율은 정수 백분율로 바꾸고 미관측은 null로 둔다', () => {
    expect(ratioPct(0.456)).toBe(46);
    expect(ratioPct(null)).toBeNull();
  });
});

describe('일별 집계 시계열', () => {
  it('날짜 축에 붙이고 집계되지 않은 날은 NaN으로 남긴다', () => {
    const series = selectDailySeries([
      stats('2026-11-03', { dau: 4, sessions: 2, sessionMinutes: 30, goldIn: 100, goldOut: 40 }),
      stats('2026-11-05', { dau: 1 }),
    ], ['2026-11-03', '2026-11-04', '2026-11-05']);
    expect(series.labels).toEqual(['11-03', '11-04', '11-05']);
    expect(series.collected).toBe(2);
    expect(series.dau).toEqual([4, NaN, 1]);
    // 세션이 없는 날은 평균 길이가 0이다(집계는 됐다)
    expect(series.avgSessionMin).toEqual([15, NaN, 0]);
    expect(series.goldIn).toEqual([100, NaN, 0]);
    expect(series.goldOut).toEqual([40, NaN, 0]);
  });
});

describe('개요 지표', () => {
  it('명부의 마지막 행동·세션 중 늦은 시각으로 오늘·7일·30일 활성 사람을 센다', () => {
    const active = selectActiveUsers([
      user({ last_action_at: '2026-11-05T01:00:00Z' }),                              // 오늘
      user({ last_action_at: '2026-10-01T00:00:00Z', last_session_at: '2026-11-01T00:00:00Z' }), // 4일 전
      user({ last_action_at: '2026-10-20T00:00:00Z' }),                              // 16일 전
      user({ last_action_at: '2026-09-01T00:00:00Z' }),                              // 30일 넘음
      user(),                                                                         // 기록 없음
    ], NOW);
    expect(active).toEqual({ today: 1, week: 2, month: 3 });
  });

  it('오늘(KST) 처음 들어온 사람과 그중 가입 계정을 센다', () => {
    expect(selectNewToday([
      user({ signed_up_at: '2026-11-04T16:00:00Z', is_anonymous: false }), // KST 11-05 01:00
      user({ signed_up_at: '2026-11-05T02:00:00Z' }),
      user({ signed_up_at: '2026-11-04T14:00:00Z' }),                      // KST 11-04
    ], NOW)).toEqual({ users: 2, accounts: 1 });
  });

  it('오늘 시작한 세션의 평균 길이를 낸다. 없으면 null이다', () => {
    expect(selectTodaySessions([
      session('2026-11-05T01:00:00Z', 600),
      session('2026-11-04T16:00:00Z', 1200),
      session('2026-11-04T10:00:00Z', 9999),
    ], NOW)).toEqual({ count: 2, avgSec: 900 });
    expect(selectTodaySessions([], NOW)).toEqual({ count: 0, avgSec: null });
  });

  it('리텐션은 값이 정해진 가장 최근 코호트를 고른다', () => {
    const rows = [
      { day: '2026-11-04', size: 3, d1: null, d7: null, d30: null },
      { day: '2026-11-03', size: 4, d1: 0.5, d7: null, d30: null },
      { day: '2026-10-20', size: 0, d1: 0, d7: 0, d30: null },
      { day: '2026-10-25', size: 5, d1: 0.6, d7: 0.2, d30: null },
    ];
    expect(latestRetention(rows, 'd1')).toEqual({ day: '2026-11-03', size: 4, pct: 50 });
    expect(latestRetention(rows, 'd7')).toEqual({ day: '2026-10-25', size: 5, pct: 20 });
    expect(latestRetention(rows, 'd30')).toBeNull();
  });

  it('코호트 표는 최근 가입일부터 자르고 비율을 백분율로 바꾼다', () => {
    const table = selectRetentionTable([
      { day: '2026-11-01', size: 2, d1: 0.5, d7: null, d30: null },
      { day: '2026-11-03', size: 4, d1: 0.25, d7: null, d30: null },
      { day: '2026-10-01', size: 1, d1: 1, d7: 1, d30: 0 },
    ], 2);
    expect(table).toEqual([
      { day: '2026-11-03', size: 4, d1: 25, d7: null, d30: null },
      { day: '2026-11-01', size: 2, d1: 50, d7: null, d30: null },
    ]);
  });
});

describe('실시간 접속', () => {
  it('위치 이름은 마을, 해역 이름, 지역 이름 순으로 정한다', () => {
    expect(placeName('village', 'village')).toBe('마을');
    expect(placeName('world', 'indian')).toBe('인도양');
    expect(placeName('world', null)).toBe('대양');
    expect(placeName(null, null)).toBe('—');
  });

  it('오래 연결된 순으로 놓고 가입·게스트 수와 위치 분포를 센다', () => {
    const board = selectLiveBoard({
      count: 3,
      online: [
        { uid: 'a', nick: '가', nickname: '가', email: null, region: 'village', zone: null, connectedAt: '2026-11-05T02:55:00Z', guest: true },
        { uid: 'b', nick: '나', nickname: '나', email: 'b@example.test', region: 'world', zone: 'indian', connectedAt: '2026-11-05T01:00:00Z', guest: false },
        { uid: 'c', nick: '낚시꾼', nickname: null, email: 'c@example.test', region: 'village', zone: null, connectedAt: '2026-11-05T02:00:00Z', guest: false },
      ],
    }, NOW);
    expect(board.rows.map(row => [row.uid, row.connectedSec])).toEqual([['b', 7200], ['c', 3600], ['a', 300]]);
    // 식별 정보는 채팅 이름(nick)이 아니라 프로필 닉네임과 이메일이다
    expect(board.rows.map(row => row.identity)).toEqual([
      { user_id: 'b', nickname: '나', email: 'b@example.test', is_anonymous: false },
      { user_id: 'c', nickname: null, email: 'c@example.test', is_anonymous: false },
      { user_id: 'a', nickname: '가', email: null, is_anonymous: true },
    ]);
    expect(board).toMatchObject({ members: 2, guests: 1, places: { labels: ['마을', '인도양'], values: [2, 1] } });
    expect(selectLiveBoard(null, NOW)).toMatchObject({ rows: [], members: 0, guests: 0 });
  });
});
