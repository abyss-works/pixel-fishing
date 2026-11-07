import type { ReactNode } from 'react';
import PixelIcon from '../PixelIcon';
import type { GlyphId } from '../PixelIcon';
import { cx } from '../cx';

// HUD 값 칸 - 자원 바와 의뢰 현황이 함께 쓰는 "표지 | 값" 가로 한 줄 한 칸.
// 표지는 픽셀 아이콘(glyph)이거나 값 색(tone)의 작은 도형(marker)이다. 도형은 색만으로 구분되지 않도록 모양이 다르다
// (네모, 다이아몬드). 이름(label)은 화면 글자로 그리지 않고 읽는 이에게만 보이는 글자(sr-only)로 두며,
// 눈으로 읽는 설명은 호출부가 툴팁으로 단다.
// sr-only 이름 끝의 공백은 의도적이다: 이름과 값이 붙어 textContent가 "골드60"이 되면 HUD를 문자열로 읽는 테스트가 값을 못 찾는다.
// 값은 픽셀 폰트(고정폭)다. 값 글자는 스테이지 폭이 960px 미만이면 13px, 960px 이상이면 16px이다.
// 표지 크기: 아이콘은 12px(12칸 격자의 1배), 960px 이상이면 24px(2배)다. 도형은 5칸 격자의 2배 10px, 960px 이상이면 3배 15px다.
// 정수 배율이라 픽셀 모서리가 흐려지지 않는다. 360 폭의 가장 긴 값이 한 줄에 들어가는 계산은 자원 바 주석에 있다.
const HUD_STAT_TONE = {
  gold: 'text-gold', orange: 'text-orange', danger: 'text-danger', epic: 'text-epic',
} as const;
export type HudStatTone = keyof typeof HUD_STAT_TONE;
export type HudMarkerShape = 'square' | 'diamond';

/** 5칸 격자의 픽셀 도형 - 네모는 가득 찬 5x5, 다이아몬드는 가운데 열에서 퍼지는 마름모 */
const MARKER_CELLS: Record<HudMarkerShape, [number, number, number, number][]> = {
  square: [[0, 0, 5, 5]],
  diamond: [[2, 0, 1, 1], [1, 1, 3, 1], [0, 2, 5, 1], [1, 3, 3, 1], [2, 4, 1, 1]],
};

function Marker({ shape }: { shape: HudMarkerShape }) {
  return (
    <svg viewBox="0 0 5 5" shapeRendering="crispEdges" aria-hidden="true" data-marker={shape}
         className="size-2.5 @min-[960px]:size-[15px] shrink-0 fill-current">
      {MARKER_CELLS[shape].map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} />)}
    </svg>
  );
}

export default function HudStat({ glyph, marker = 'square', label, tone = 'gold', children }: {
  glyph?: GlyphId; marker?: HudMarkerShape; label: string; tone?: HudStatTone; children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      {glyph
        ? <PixelIcon glyph={glyph} className="size-3 @min-[960px]:size-6 shrink-0 text-text-dim align-baseline" />
        : <span className={cx('inline-flex', HUD_STAT_TONE[tone])}><Marker shape={marker} /></span>}
      <span className="sr-only">{label}{' '}</span>
      <span className={cx('pf-accent leading-none text-[13px] @min-[960px]:text-[16px]', HUD_STAT_TONE[tone])}>{children}</span>
    </span>
  );
}
