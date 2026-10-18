// 기간 전환(30일·90일) — 경제·진행 탭 머리의 조작과, 그 아래 시계열 구역이 함께 쓴다.
export type DayRange = '30' | '90';

export const DAY_RANGE_OPTIONS: { key: DayRange; label: string }[] = [
  { key: '30', label: '30일' },
  { key: '90', label: '90일' },
];
