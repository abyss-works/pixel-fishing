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
/** "수량 / 상한" 표기 - 자릿수 구분 쉼표를 쓰고 슬래시 앞뒤에 공백을 둔다. 스탯 창 가방 칸과 헤더 가방 툴팁이 함께 쓴다 */
export const fmtRatio = (n: number, total: number): string => `${fmtNum(n)} / ${fmtNum(total)}`;
/** 오늘 남은 클리어 "남은 수/한도" 표기 - 수배판, 의뢰 창, 헤더 의뢰 현황 툴팁이 함께 쓴다. 아직 모르면(null) - */
export const fmtClearsLeft = (left: number | null, cap: number): string => (left === null ? '-' : `${left}/${cap}`);
/** 헤더처럼 폭이 아주 좁은 자리의 줄임 표기 - 유효숫자 3자리. 999까지는 그대로, 1000부터 K, M, B, T 단위에 3자리까지 보인다
 *  (999K, 12.4K, 1.23M). 끝자리 0은 생략한다. 단위 아래는 버린다(가진 것보다 많아 보이지 않게).
 *  글자 수가 최대 5(3자리 + 소수점 + 단위)라 폭이 거의 흔들리지 않는다. 정확한 값은 호출부가 툴팁 등으로 따로 보인다.
 *  다른 화면의 줄임 표기(fmtCompact)는 이 규칙과 별개다. */
export function fmtCompact3(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1_000) return fmtNum(n);
  const [size, unit] = COMPACT_UNITS.find(([s]) => abs >= s)!;
  // 단위의 1/100로 먼저 나눠 정수로 버린다 - 부동소수 오차 없이 3자리를 자른다
  const hundredths = Math.trunc(abs / (size / 100));
  const whole = Math.trunc(hundredths / 100);
  let fraction = '';
  if (hundredths < 1_000) fraction = String(hundredths % 100).padStart(2, '0').replace(/0$/, '');
  else if (hundredths < 10_000) fraction = String(Math.trunc((hundredths % 100) / 10));
  if (fraction === '0') fraction = '';
  return `${n < 0 ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}${unit}`;
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
