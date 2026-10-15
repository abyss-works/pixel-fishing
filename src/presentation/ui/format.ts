// 표시용 숫자 포맷 — 단일 근원. UI 규약: 숫자와 단위는 붙여 쓴다(500G, 1,200G).
// 관리자 대시보드의 만/억 축약(fmtNum)과는 성격이 달라 따로 둔다.
export const fmtNum = (n: number): string => n.toLocaleString('ko-KR');
export const fmtGold = (n: number): string => `${fmtNum(n)}G`;
