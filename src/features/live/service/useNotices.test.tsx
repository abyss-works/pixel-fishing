// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoticeItem } from '../../../game/rules/live';

const mockNotices = vi.hoisted(() => ({
  notices: [] as NoticeItem[],
  updatedAt: 0,
}));

vi.mock('./useLive', () => ({
  useLiveNotices: () => ({ notices: mockNotices.notices, updatedAt: mockNotices.updatedAt }),
}));

import { NOTICE_DISMISSED_STORAGE_KEY } from '../model/notice';
import { useNotices } from './useNotices';

describe('useNotices', () => {
  const t0 = Date.parse('2026-11-26T10:00:00.000Z');
  const t1 = Date.parse('2026-11-26T10:01:00.000Z');
  const t2 = Date.parse('2026-11-26T10:02:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    localStorage.clear();
    mockNotices.notices = [];
    mockNotices.updatedAt = t0;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('시작·마감 경계 타이머에 맞춰 activeNotices와 stackNotices를 자동 갱신한다', () => {
    mockNotices.notices = [
      {
        id: 1,
        title: '예약 공지',
        body: '곧 시작해요.',
        startsAt: new Date(t1).toISOString(),
        endsAt: new Date(t2).toISOString(),
        createdAt: new Date(t0).toISOString(),
      },
    ];
    const { result } = renderHook(() => useNotices());
    expect(result.current.activeNotices).toEqual([]);
    expect(result.current.stackNotices).toEqual([]);

    act(() => { vi.advanceTimersByTime(t1 - t0); });
    expect(result.current.activeNotices.map(n => n.id)).toEqual([1]);
    expect(result.current.stackNotices.map(n => n.id)).toEqual([1]);

    act(() => { vi.advanceTimersByTime(t2 - t1); });
    expect(result.current.activeNotices).toEqual([]);
    expect(result.current.stackNotices).toEqual([]);
  });

  it('dismissNotice로 한 겹씩 닫고 localStorage에 보관하며 사라진 id는 정리한다', () => {
    mockNotices.notices = [
      {
        id: 1,
        title: '첫째 공지',
        body: '본문 1',
        startsAt: new Date(t0).toISOString(),
        endsAt: new Date(t2).toISOString(),
        createdAt: new Date(t0).toISOString(),
      },
      {
        id: 2,
        title: '둘째 공지',
        body: '본문 2',
        startsAt: new Date(t0).toISOString(),
        endsAt: new Date(t2).toISOString(),
        createdAt: new Date(t1).toISOString(),
      },
    ];
    localStorage.setItem(NOTICE_DISMISSED_STORAGE_KEY, JSON.stringify([999]));

    const { result, rerender } = renderHook(() => useNotices());
    expect(result.current.stackNotices.map(n => n.id)).toEqual([2, 1]);
    expect(JSON.parse(localStorage.getItem(NOTICE_DISMISSED_STORAGE_KEY) ?? '[]')).toEqual([]);

    act(() => { result.current.dismissNotice(2); });
    expect(result.current.stackNotices.map(n => n.id)).toEqual([1]);
    expect(result.current.activeNotices.map(n => n.id)).toEqual([2, 1]);
    expect(JSON.parse(localStorage.getItem(NOTICE_DISMISSED_STORAGE_KEY) ?? '[]')).toEqual([2]);

    // 공지 2가 서버 목록에서 사라지면 저장소에서도 정리된다
    mockNotices.notices = [mockNotices.notices[0]];
    rerender();
    expect(JSON.parse(localStorage.getItem(NOTICE_DISMISSED_STORAGE_KEY) ?? '[]')).toEqual([]);
  });
});
