import { describe, expect, it } from 'vitest';
import type { NoticeItem } from '../../../game/rules/live';
import {
  nextNoticeBoundaryMs,
  parseDismissedNotices,
  pruneDismissedIds,
  serializeDismissedNotices,
  stackableNotices,
  visibleActiveNotices,
} from './notice';

const n = (id: number, startsAt: string, endsAt: string, createdAt = startsAt): NoticeItem => ({
  id,
  title: `공지 ${id}`,
  body: `본문 ${id}`,
  startsAt,
  endsAt,
  createdAt,
});

describe('기간제 공지 모델', () => {
  const t0 = Date.parse('2026-11-26T00:00:00.000Z');
  const t1 = Date.parse('2026-11-26T01:00:00.000Z');
  const t2 = Date.parse('2026-11-26T02:00:00.000Z');
  const t3 = Date.parse('2026-11-26T03:00:00.000Z');

  it('visibleActiveNotices는 startsAt <= now < endsAt 범위만 최신순으로 반환한다', () => {
    const list = [
      n(1, new Date(t0).toISOString(), new Date(t1).toISOString()), // t1에서 마감
      n(2, new Date(t0).toISOString(), new Date(t3).toISOString()), // 활성(이전 시작)
      n(3, new Date(t1).toISOString(), new Date(t3).toISOString()), // t1에 시작(최신 시작)
      n(4, new Date(t2).toISOString(), new Date(t3).toISOString()), // 아직 시작 전
    ];

    // t1 시점: 공지 1은 endsAt == t1 이므로 제외, 공지 3은 startsAt == t1 이므로 포함, 최신 시작(3) 먼저
    expect(visibleActiveNotices(list, t1).map(item => item.id)).toEqual([3, 2]);
    // t2 시점: 공지 4도 포함
    expect(visibleActiveNotices(list, t2).map(item => item.id)).toEqual([4, 3, 2]);
    // t3 시점: 모두 마감
    expect(visibleActiveNotices(list, t3)).toEqual([]);
  });

  it('같은 시작 시각이면 생성 시각·id 내림차순으로 정렬한다', () => {
    const sameStart = new Date(t0).toISOString();
    const end = new Date(t3).toISOString();
    const list = [
      n(1, sameStart, end, new Date(t0).toISOString()),
      n(2, sameStart, end, new Date(t1).toISOString()),
      n(3, sameStart, end, new Date(t1).toISOString()),
    ];
    expect(visibleActiveNotices(list, t1).map(item => item.id)).toEqual([3, 2, 1]);
  });

  it('stackableNotices는 닫은 공지 id를 제외하고 순서를 유지한다', () => {
    const active = [
      n(3, new Date(t1).toISOString(), new Date(t3).toISOString()),
      n(2, new Date(t0).toISOString(), new Date(t3).toISOString()),
      n(1, new Date(t0).toISOString(), new Date(t2).toISOString()),
    ];
    expect(stackableNotices(active, [2]).map(item => item.id)).toEqual([3, 1]);
    expect(stackableNotices(active, new Set([3, 1])).map(item => item.id)).toEqual([2]);
  });

  it('nextNoticeBoundaryMs는 now 이후 가장 가까운 시작 또는 마감 경계까지 남은 ms를 돌려준다', () => {
    const list = [
      n(1, new Date(t1).toISOString(), new Date(t3).toISOString()),
      n(2, new Date(t2).toISOString(), new Date(t3).toISOString()),
    ];
    expect(nextNoticeBoundaryMs(list, t0)).toBe(t1 - t0);
    expect(nextNoticeBoundaryMs(list, t1)).toBe(t2 - t1);
    expect(nextNoticeBoundaryMs(list, t2)).toBe(t3 - t2);
    expect(nextNoticeBoundaryMs(list, t3)).toBeNull();
    expect(nextNoticeBoundaryMs([], t0)).toBeNull();
  });

  it('pruneDismissedIds는 공지 목록에서 사라진 id를 정리한다', () => {
    const notices = [
      n(2, new Date(t0).toISOString(), new Date(t3).toISOString()),
      n(5, new Date(t1).toISOString(), new Date(t3).toISOString()),
    ];
    expect(pruneDismissedIds([1, 2, 3, 5, 2], notices)).toEqual([2, 5]);
    expect(pruneDismissedIds([1, 3], [])).toEqual([]);
  });

  it('parseDismissedNotices·serializeDismissedNotices는 잘못된 저장값을 안전하게 걸러낸다', () => {
    expect(parseDismissedNotices(null)).toEqual([]);
    expect(parseDismissedNotices('not-json')).toEqual([]);
    expect(parseDismissedNotices('{"a":1}')).toEqual([]);
    expect(parseDismissedNotices('[1, "2", null, 3, 1, -1, 1.5]')).toEqual([1, 3]);
    expect(parseDismissedNotices(serializeDismissedNotices([4, 2]))).toEqual([4, 2]);
  });
});
