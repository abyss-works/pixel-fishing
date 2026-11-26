import { isNoticeActive, NOTICE_BODY_MAX, NOTICE_TITLE_MAX, normalizeNoticeDraft } from '../../../game/rules/live';
import type { NoticeItem } from '../../../game/rules/live';

export { NOTICE_BODY_MAX, NOTICE_TITLE_MAX, normalizeNoticeDraft };

export const NOTICE_DISMISSED_STORAGE_KEY = 'pf-dismissed-notices';

function noticeOrderCompare(a: NoticeItem, b: NoticeItem): number {
  const startDiff = Date.parse(b.startsAt) - Date.parse(a.startsAt);
  if (Number.isFinite(startDiff) && startDiff !== 0) return startDiff;
  const createdDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff;
  return b.id - a.id;
}

/** 현재 시각 기준 활성(startsAt <= now < endsAt) 공지만 최신순으로 추린다. */
export function visibleActiveNotices(notices: readonly NoticeItem[], now: number): NoticeItem[] {
  return notices
    .filter(item => isNoticeActive(item, now))
    .sort(noticeOrderCompare);
}

/** 활성 공지 중 사용자가 닫지 않은 공지만 순서대로 남긴다. */
export function stackableNotices(
  active: readonly NoticeItem[],
  dismissedIds: ReadonlySet<number> | readonly number[],
): NoticeItem[] {
  const hidden = dismissedIds instanceof Set ? dismissedIds : new Set(dismissedIds);
  return active.filter(item => !hidden.has(item.id));
}

/** 다음 공지 활성·마감 경계까지 남은 시간(ms). 예정된 경계가 없으면 null을 돌려준다. */
export function nextNoticeBoundaryMs(notices: readonly NoticeItem[], now: number): number | null {
  let nextBoundary: number | null = null;
  for (const item of notices) {
    for (const raw of [item.startsAt, item.endsAt]) {
      const ms = Date.parse(raw);
      if (!Number.isFinite(ms) || ms <= now) continue;
      if (nextBoundary === null || ms < nextBoundary) nextBoundary = ms;
    }
  }
  return nextBoundary === null ? null : nextBoundary - now;
}

/** 공지 목록에서 사라진 id를 닫은 목록에서 정리한다. */
export function pruneDismissedIds(dismissed: readonly number[], notices: readonly NoticeItem[]): number[] {
  const existing = new Set(notices.map(item => item.id));
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of dismissed) {
    if (!existing.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function parseDismissedNotices(raw: string | null): number[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of parsed) {
    if (typeof item !== 'number' || !Number.isInteger(item) || item <= 0 || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function serializeDismissedNotices(ids: readonly number[]): string {
  return JSON.stringify(ids);
}
