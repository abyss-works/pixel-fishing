// 픽셀 렌더링 공통 헬퍼 — 씬(index.ts)과 어종 스프라이트(sprites.ts)가 공유
export type Ctx = CanvasRenderingContext2D;

// 캔버스 UI 팔레트 — index.css 토큰과 같은 값 
export const UI = {
  text: '#f2f7fb',
  dim: 'rgba(242,247,251,0.7)',
  gold: '#ffd54f',
  danger: '#ff8a80',
  shadow: 'rgba(6,12,24,0.65)',
};

export function R(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x | 0, y | 0, w, h);
}

export function label(ctx: Ctx, str: string, x: number, y: number, c = UI.text, size = 9) {
  ctx.font = `bold ${size}px 'Malgun Gothic', sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = UI.shadow;
  ctx.fillText(str, x + 1, y + 1);
  ctx.fillStyle = c;
  ctx.fillText(str, x, y);
}

export function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// 밝기 보정 — factor>1은 흰색 방향, factor<1은 검정 방향으로 섞는다 (지느러미/음영/하이라이트용)
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(
    factor >= 1 ? c + (255 - c) * (factor - 1) : c * factor,
  )));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}
