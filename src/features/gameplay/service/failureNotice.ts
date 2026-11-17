import { useSyncExternalStore } from 'react';

// 메시지 창 오류 자리에 보이는 실패 안내 한 줄. 정책 표가 오류 자리에 알리기로 한 종류(restricted, rate-limited, bug)의 문구를 담는다.
// 같은 문구가 떠 있는 동안 반복해 오면 알림을 늘리지 않고 보이는 시간만 늘린다.

/** 안내가 보이는 시간 */
export const FAILURE_NOTICE_MS = 6000;

let notice: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => { for (const fn of listeners) fn(); };

/** 지금 보이는 안내 문구. 없으면 null */
export function currentFailureNotice(): string | null {
  return notice;
}

/** 안내를 지운다 */
export function clearFailureNotice(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (notice === null) return;
  notice = null;
  emit();
}

/** 안내를 보인다. 이미 같은 문구가 떠 있었으면 보이는 시간만 늘리고 false, 새로 알리면 true */
export function showFailureNotice(text: string): boolean {
  const fresh = notice !== text;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(clearFailureNotice, FAILURE_NOTICE_MS);
  if (fresh) { notice = text; emit(); }
  return fresh;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 오류 자리에 보일 실패 안내. 없으면 null */
export function useFailureNotice(): string | null {
  return useSyncExternalStore(subscribe, currentFailureNotice, currentFailureNotice);
}
