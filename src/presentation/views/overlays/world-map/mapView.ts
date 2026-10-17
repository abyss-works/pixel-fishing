// 세계지도 보기 상태 — 확대 배율과 화면 왼쪽 위가 가리키는 지도 좌표(지도 px).
// 계산은 순수 함수이고, 좌표 입력은 모두 캔버스 px(화면 표시 크기와 무관한 내부 해상도)다.
// 보던 보기는 브라우저 설정으로 남겨 창을 닫았다 열어도 이어 본다(개발 도구 패널 위치와 같은 표현 설정).

export interface MapView { scale: number; x: number; y: number }

export const MAP_ZOOM_MIN = 1;
export const MAP_ZOOM_MAX = 4;
export const MAP_ZOOM_STEP = 1.25;
export const FULL_VIEW: MapView = { scale: 1, x: 0, y: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 배율을 범위 안으로, 보이는 창이 지도 밖으로 나가지 않게 위치를 맞춘다 */
export function clampView(v: MapView, w: number, h: number): MapView {
  const scale = clamp(v.scale, MAP_ZOOM_MIN, MAP_ZOOM_MAX);
  return {
    scale,
    x: clamp(v.x, 0, w - w / scale),
    y: clamp(v.y, 0, h - h / scale),
  };
}

/** (px, py) 아래의 지도 지점을 고정한 채 배율을 factor배 한다 */
export function zoomAt(v: MapView, factor: number, px: number, py: number, w: number, h: number): MapView {
  const ax = v.x + px / v.scale;
  const ay = v.y + py / v.scale;
  const scale = clamp(v.scale * factor, MAP_ZOOM_MIN, MAP_ZOOM_MAX);
  return clampView({ scale, x: ax - px / scale, y: ay - py / scale }, w, h);
}

/** 화면을 (dx, dy)만큼 끌었을 때 — 지도는 손을 따라 움직이므로 보기 창은 반대로 간다 */
export function panBy(v: MapView, dx: number, dy: number, w: number, h: number): MapView {
  return clampView({ ...v, x: v.x - dx / v.scale, y: v.y - dy / v.scale }, w, h);
}

/** 지도 좌표 → 캔버스 좌표 */
export function toScreen(v: MapView, x: number, y: number): { x: number; y: number } {
  return { x: (x - v.x) * v.scale, y: (y - v.y) * v.scale };
}

export const MAP_VIEW_KEY = 'pf-worldmap-view';

export function loadMapView(): MapView | null {
  try {
    const raw = localStorage.getItem(MAP_VIEW_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<MapView>;
    return [v.scale, v.x, v.y].every(n => typeof n === 'number' && Number.isFinite(n))
      ? { scale: v.scale!, x: v.x!, y: v.y! }
      : null;
  } catch {
    return null;
  }
}

export function saveMapView(v: MapView): void {
  try { localStorage.setItem(MAP_VIEW_KEY, JSON.stringify(v)); } catch { /* 저장 실패 무해 */ }
}
