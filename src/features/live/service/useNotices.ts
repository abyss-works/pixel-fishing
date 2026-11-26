import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  nextNoticeBoundaryMs,
  NOTICE_DISMISSED_STORAGE_KEY,
  parseDismissedNotices,
  pruneDismissedIds,
  serializeDismissedNotices,
  stackableNotices,
  visibleActiveNotices,
} from '../model/notice';
import { useLiveNotices } from './useLive';

const MAX_TIMEOUT_MS = 2_147_483_647;

function readDismissedFromStorage(): number[] {
  try {
    return parseDismissedNotices(localStorage.getItem(NOTICE_DISMISSED_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeDismissedToStorage(ids: readonly number[]): void {
  try {
    localStorage.setItem(NOTICE_DISMISSED_STORAGE_KEY, serializeDismissedNotices(ids));
  } catch {
    // 저장소 접근 불가 환경에서는 메모리 상태만 유지한다
  }
}

/** 기간제 상시 공지의 활성 필터링·경계 타이머 재계산·기기별 닫힘 상태를 관리한다. */
export function useNotices() {
  const { notices, updatedAt } = useLiveNotices();
  const [tickNow, setTickNow] = useState(() => Date.now());
  const [dismissedIds, setDismissedIds] = useState<number[]>(() => readDismissedFromStorage());
  const now = Math.max(tickNow, updatedAt);

  useEffect(() => {
    const delay = nextNoticeBoundaryMs(notices, now);
    if (delay === null) return;
    const timer = setTimeout(() => setTickNow(Date.now()), Math.min(delay, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [notices, now]);

  const activeDismissed = useMemo(() => pruneDismissedIds(dismissedIds, notices), [dismissedIds, notices]);

  useEffect(() => {
    writeDismissedToStorage(activeDismissed);
  }, [activeDismissed]);

  const activeNotices = useMemo(() => visibleActiveNotices(notices, now), [notices, now]);
  const stackNotices = useMemo(() => stackableNotices(activeNotices, activeDismissed), [activeNotices, activeDismissed]);

  const dismissNotice = useCallback((id: number) => {
    setDismissedIds(prev => {
      const pruned = pruneDismissedIds(prev, notices);
      if (pruned.includes(id)) return pruned;
      const next = [...pruned, id];
      writeDismissedToStorage(next);
      return next;
    });
  }, [notices]);

  return { activeNotices, stackNotices, dismissNotice };
}
