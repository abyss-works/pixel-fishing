// 개발 도구 패널 위치 — 끌어서 옮긴 자리를 브라우저 설정으로 남긴다(캔버스 덮개와 같은 표현 설정).

export const PANEL_POSITION_KEY = 'pf-devtools-pos';

export interface Point2 { x: number; y: number }
export interface Size2 { width: number; height: number }

/** 머리줄 높이 — 화면 아래로 끌어도 이만큼은 남아 다시 잡을 수 있다 */
const HANDLE = 40;
const MARGIN = 16;

export const defaultPanelPosition = (viewport: Size2, size: Size2): Point2 =>
  ({ x: Math.max(0, viewport.width - size.width - MARGIN), y: MARGIN });

/** 패널 왼쪽은 화면 안, 머리줄은 화면 위아래 안에 둔다 */
export function clampPanel(pos: Point2, viewport: Size2, size: Size2): Point2 {
  return {
    x: Math.min(Math.max(0, pos.x), Math.max(0, viewport.width - size.width)),
    y: Math.min(Math.max(0, pos.y), Math.max(0, viewport.height - HANDLE)),
  };
}

export function loadPanelPosition(): Point2 | null {
  try {
    const raw = localStorage.getItem(PANEL_POSITION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Point2>;
    return typeof v.x === 'number' && typeof v.y === 'number' ? { x: v.x, y: v.y } : null;
  } catch {
    return null;
  }
}

export function savePanelPosition(pos: Point2): void {
  try { localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(pos)); } catch { /* 저장 실패 무해 */ }
}
