import type { ReactNode } from 'react';
import PixelIcon from '../PixelIcon';
import type { GlyphId } from '../PixelIcon';
import { cx } from '../cx';

// HUD 값 칸 - 자원 바와 의뢰 현황이 함께 쓰는 "표지 | 값" 가로 한 줄 한 칸.
// 표지는 픽셀 아이콘(glyph)이고, 아이콘이 없으면 값 색(tone)의 작은 네모다. 이름(label)은 화면 글자로 그리지 않고
// 읽는 이에게만 보이는 글자(sr-only)로 두며, 눈으로 읽는 설명은 호출부가 툴팁으로 단다.
// sr-only 이름 끝의 공백은 의도적이다: 이름과 값이 붙어 textContent가 "골드60"이 되면 HUD를 문자열로 읽는 테스트가 값을 못 찾는다.
// 값은 픽셀 폰트(고정폭)다. 값 글자는 스테이지 폭이 960px 미만이면 13px, 960px 이상이면 14px이다.
// 표지 크기는 12px, 960px 이상이면 16px이다. 360 폭의 가장 긴 값이 한 줄에 들어가는 계산은 자원 바 주석에 있다.
const HUD_STAT_TONE = {
  gold: 'text-gold', orange: 'text-orange', danger: 'text-danger', epic: 'text-epic',
} as const;
const MARKER_TONE = {
  gold: 'bg-gold', orange: 'bg-orange', danger: 'bg-danger', epic: 'bg-epic',
} as const;
export type HudStatTone = keyof typeof HUD_STAT_TONE;

export default function HudStat({ glyph, label, tone = 'gold', children }: {
  glyph?: GlyphId; label: string; tone?: HudStatTone; children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      {glyph
        ? <PixelIcon glyph={glyph} className="size-3 @min-[960px]:size-4 shrink-0 text-text-dim align-baseline" />
        : <span aria-hidden="true" className={cx('size-1.5 @min-[960px]:size-2 shrink-0', MARKER_TONE[tone])} />}
      <span className="sr-only">{label}{' '}</span>
      <span className={cx('pf-accent leading-none text-[13px] @min-[960px]:text-[14px]', HUD_STAT_TONE[tone])}>{children}</span>
    </span>
  );
}
