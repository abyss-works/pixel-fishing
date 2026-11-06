// 고정 배치 표의 최소 폭. 열 폭 목록에서 null은 남는 폭을 받는 이름 열이다.
// 고정 열의 합에 이름 열의 최소 폭을 더한 값 밑으로 표가 줄지 않으므로, 담은 칸이 좁으면 칸 안에서 가로로 스크롤한다.
export function tableMinWidth(cols: (string | null)[], nameMin: string): string {
  const parts = cols.map(c => c ?? nameMin);
  return parts.length === 1 ? parts[0] : `calc(${parts.join(' + ')})`;
}
