import { useSyncExternalStore } from 'react';
import { gameDayOf } from '../../../game/rules/time';
import { schoolsOf } from '../../../game/world';
import type { RegionId, School } from '../../../game/world';

// 이 세션의 어군 배치 날짜 — 앱 상태의 단일 정본. 세이브 대상이 아니라 새로고침하면 다시 정한다.
// 부트 전에는 클라이언트 시계로 계산한 날짜를 쓰고, boot 결과(서버 시계)가 오면 그 값으로 바꾼다.
// 세션 중 KST 04:00이 지나도 바꾸지 않는다 — 방치 낚시 중 어군이 사라지지 않게(다음 접속에 반영).

let day: string | null = null;
const listeners = new Set<() => void>();

export function getSchoolDay(): string {
  day ??= gameDayOf(new Date().toISOString());
  return day;
}

/** boot 결과가 호출 — 서버가 정한 날짜로 교체한다. 같은 값이면 알리지 않는다 */
export function setSchoolDay(next: string): void {
  if (day === next) return;
  day = next;
  for (const fn of listeners) fn();
}

export function subscribeSchoolDay(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 테스트 격리용 — 다음 읽기에서 클라이언트 시계로 다시 계산한다 */
export function resetSchoolDay(): void {
  day = null;
  for (const fn of listeners) fn();
}

export function useSchoolDay(): string {
  return useSyncExternalStore(subscribeSchoolDay, getSchoolDay, getSchoolDay);
}

/** 지역의 현재 어군 — 같은 날짜면 같은 배열이라 의존성 배열에 그대로 둘 수 있다 */
export function useSchools(region: RegionId): School[] {
  return schoolsOf(region, useSchoolDay());
}
