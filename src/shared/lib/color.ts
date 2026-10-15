// 색 보정 — 순수 함수. 캔버스 렌더러와 스프라이트 팔레트(콘텐츠 데이터)가 함께 쓴다.

/** 밝기 보정 — factor>1은 흰색 방향, factor<1은 검정 방향으로 섞는다 (지느러미/음영/하이라이트용) */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(
    factor >= 1 ? c + (255 - c) * (factor - 1) : c * factor,
  )));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}
