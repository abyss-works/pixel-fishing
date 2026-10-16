// 표시용 숫자 포맷 — 단일 근원. UI 규약: 숫자와 단위는 붙여 쓴다(500G, 1,200G).
// 관리자 대시보드의 만/억 축약(fmtNum)과는 성격이 달라 따로 둔다.
export const fmtNum = (n: number): string => n.toLocaleString('ko-KR');
export const fmtGold = (n: number): string => `${fmtNum(n)}G`;
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
