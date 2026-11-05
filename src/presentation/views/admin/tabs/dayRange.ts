// 기간 전환 — 개요(7·30·90일)와 경제·진행 탭(30·90일) 머리의 조작과, 그 아래 시계열 구역이 함께 쓴다.
export type DayRange = '7' | '30' | '90';

export const DAY_RANGE_OPTIONS: { key: DayRange; label: string }[] = [
  { key: '30', label: '30일' },
  { key: '90', label: '90일' },
];

export const OVERVIEW_RANGE_OPTIONS: { key: DayRange; label: string }[] = [
  { key: '7', label: '7일' },
  ...DAY_RANGE_OPTIONS,
];
