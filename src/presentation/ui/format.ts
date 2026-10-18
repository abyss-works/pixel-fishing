// 표시용 숫자 포맷 — 단일 근원. UI 규약: 숫자와 단위는 붙여 쓴다(500G, 1,200G).
// 관리자 대시보드의 만/억 축약(fmtNum)과는 성격이 달라 따로 둔다.
export const fmtNum = (n: number): string => n.toLocaleString('ko-KR');
export const fmtGold = (n: number): string => `${fmtNum(n)}G`;

/** 물고기 크기(cm 값) — 1m 미만은 cm 소수 한 자리, 1m 이상은 m 소수 두 자리(99.9cm · 3.85m) */
export function fmtSize(cm: number): string {
  return Math.round(cm * 10) / 10 < 100 ? `${cm.toFixed(1)}cm` : `${(cm / 100).toFixed(2)}m`;
}

const COMPACT_UNITS = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const;
/** HUD처럼 폭이 고정된 자리의 줄임 표기 — 9,999까지는 그대로, 그 위는 K·M·B·T에 소수 한 자리(.0은 생략).
 *  단위 아래는 버린다(가진 것보다 많아 보이지 않게). 정확한 값이 필요한 가격·잔액에는 쓰지 않는다. */
export function fmtCompact(n: number): string {
  if (Math.abs(n) < 10_000) return fmtNum(n);
  const [size, unit] = COMPACT_UNITS.find(([s]) => Math.abs(n) >= s)!;
  // 단위의 1/10로 먼저 나눈다 — 정수끼리 나눠야 2.3M이 부동소수 오차로 2.2M이 되지 않는다
  const tenths = Math.trunc(n / (size / 10));
  return `${tenths % 10 === 0 ? tenths / 10 : (tenths / 10).toFixed(1)}${unit}`;
}
/** 남은 시간 — 분 단위를 "1시간 52분"/"52분"으로. 0 이하는 "1분 미만" */
export function fmtMinutes(min: number): string {
  if (min < 1) return '1분 미만';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m > 0 ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
}

/** 받침에 따라 조사를 고른다 — 네임드 이름처럼 데이터에서 온 말 뒤에 붙일 때 */
export function josa(word: string, pair: '이/가' | '을/를'): string {
  const code = word.charCodeAt(word.length - 1);
  const hangul = code >= 0xac00 && code <= 0xd7a3;
  const batchim = hangul && (code - 0xac00) % 28 !== 0;
  const [withBatchim, without] = pair.split('/');
  return `${word}${batchim ? withBatchim : without}`;
}
