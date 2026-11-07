import type { ReactNode } from 'react';
import PixelIcon from '../PixelIcon';
import type { GlyphId } from '../PixelIcon';
import { cx } from '../cx';

// HUD 값 칸 - 자원 바와 의뢰 현황이 함께 쓰는 "위 이름, 아래 값" 두 행 한 칸.
// 이름 줄이 자리표가 되고 값만 아래에서 바뀌어, 값 길이가 달라져도 이웃 칸이 밀리지 않는다.
// 이름 앞에 픽셀 아이콘(glyph)을 둘 수 있다. 아이콘이 없는 칸은 이름만 쓴다.
// 값은 픽셀 폰트(고정폭)다. PC 레이아웃 전용이며 이름은 text-sm(13px), 값은 text-lg(17px)로 늘 같다.
const HUD_STAT_TONE = {
  gold: 'text-gold', orange: 'text-orange', danger: 'text-danger', epic: 'text-epic',
} as const;
export type HudStatTone = keyof typeof HUD_STAT_TONE;

export default function HudStat({ glyph, label, tone = 'gold', children }: {
  glyph?: GlyphId; label: string; tone?: HudStatTone; children: ReactNode;
}) {
  return (
    <span className="flex flex-col items-center justify-center gap-1.5 whitespace-nowrap">
      {/* 끝의 공백은 의도적이다: 두 행이 붙어 textContent가 "골드60"이 되면 HUD를
          문자열로 읽는 테스트가 값을 못 찾는다. 지우지 말 것. */}
      <span className="flex items-center gap-1 text-sm leading-none text-text-dim">
        {glyph && <PixelIcon glyph={glyph} size={12} />}{label}{' '}
      </span>
      <span className={cx('text-lg leading-none pf-accent', HUD_STAT_TONE[tone])}>{children}</span>
    </span>
  );
}
