import type { ReactNode } from 'react';
import PixelIcon from '../PixelIcon';
import type { GlyphId } from '../PixelIcon';
import { cx } from '../cx';

// HUD 값 칸 - 자원 바와 의뢰 현황이 함께 쓰는 "표지 | 값" 가로 한 줄 한 칸.
// 표지는 픽셀 아이콘(glyph)이거나, 아이콘이 없으면 값 색(tone)의 도형(marker)이다. 도형도 PixelIcon의 기호(네모, 다이아몬드)라
// 색만으로 구분되지 않는다. 이름(label)은 화면 글자로 그리지 않고 읽는 이에게만 보이는 글자(sr-only)로 두며,
// 눈으로 읽는 설명은 호출부가 툴팁으로 단다.
// sr-only 이름 끝의 공백은 의도적이다: 이름과 값이 붙어 textContent가 "골드60"이 되면 HUD를 문자열로 읽는 테스트가 값을 못 찾는다.
// 모바일 배치 전용이다. 값은 픽셀 폰트(고정폭)이고 글자는 스테이지 폭이 380px 미만이면 12px, 380px 이상이면 13px이다.
// 표지 크기는 12px(12칸 격자의 1배)라 픽셀 모서리가 흐려지지 않는다.
// 360 폭의 가장 긴 값이 한 줄에 들어가는 계산은 모바일 자원 바 주석에 있다.
const HUD_STAT_TONE = {
  gold: 'text-gold', orange: 'text-orange', danger: 'text-danger', epic: 'text-epic',
} as const;
export type HudStatTone = keyof typeof HUD_STAT_TONE;
export type HudMarkerShape = Extract<GlyphId, 'square' | 'diamond'>;

export default function MobileHudStat({ glyph, marker = 'square', label, tone = 'gold', children }: {
  glyph?: GlyphId; marker?: HudMarkerShape; label: string; tone?: HudStatTone; children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      <PixelIcon glyph={glyph ?? marker}
                 className={cx('size-3 shrink-0 align-baseline', glyph ? 'text-text-dim' : HUD_STAT_TONE[tone])} />
      <span className="sr-only">{label}{' '}</span>
      <span className={cx('pf-accent leading-none text-[12px] @min-[380px]:text-[13px]', HUD_STAT_TONE[tone])}>{children}</span>
    </span>
  );
}
