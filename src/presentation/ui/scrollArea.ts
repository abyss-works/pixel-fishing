// 세로로 스크롤하는 칸의 공용 클래스. 막대는 6px 흰 막대(pf-scroll-panel)이고, 막대 자리는 늘 확보하며(scrollbar-gutter)
// 내용과 막대 사이에 여백을 둔다. 막대가 나타나도 내용 폭이 흔들리지 않고 내용이 막대에 붙지 않는다.
// 칸 높이와 모양은 호출부가 정한다. 막대를 숨기는 칸(pf-scroll)은 이 규칙의 예외라 여기에 두지 않는다.

/** 막대 자리 + 내용과 막대 사이 8px 여백 */
export const SCROLL_Y = 'pf-vscroll pf-scroll-panel pr-2 [scrollbar-gutter:stable]';

/** 막대 자리만. 칸이 이미 오른쪽 안쪽 여백(8px 이상)을 가진 틀(Inset, Frame의 p-2 이상)에 쓴다 */
export const SCROLL_Y_PADDED = 'pf-vscroll pf-scroll-panel [scrollbar-gutter:stable]';
