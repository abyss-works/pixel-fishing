// 모바일 시트의 열고 닫는 규칙 — 아래 탭 줄과 시트 머리가 같은 규칙을 쓴다.

/** 아래로 이만큼(px) 끌면 시트가 닫힌다 */
const DRAG_CLOSE_PX = 48;

/** 탭을 눌렀을 때: 시트가 열려 있고 같은 탭이면 닫고, 아니면 연다. select는 탭 내용을 바꿔야 하는지다 */
export function pressSheetTab<K extends string>(
  state: { open: boolean; active: K }, tab: K,
): { open: boolean; select: boolean } {
  if (state.open && tab === state.active) return { open: false, select: false };
  return { open: true, select: tab !== state.active };
}

/** 시트 머리를 startY에서 endY까지 끌었을 때 닫아야 하는가 */
export const isSheetDragClose = (startY: number, endY: number): boolean => endY - startY >= DRAG_CLOSE_PX;
