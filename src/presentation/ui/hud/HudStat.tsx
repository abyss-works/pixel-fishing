import type { ReactNode } from 'react';
import PixelIcon from '../PixelIcon';
import type { GlyphId } from '../PixelIcon';

// HUD 값 칸 - PC 레이아웃의 자원 바가 쓰는 "위 아이콘과 이름, 아래 값" 두 행 한 칸.
// 이름 줄이 자리표가 되고 값만 아래에서 바뀌어, 값 길이가 달라져도 이웃 칸이 밀리지 않는다.
// 값은 픽셀 폰트(고정폭)다. PC 레이아웃 전용이며 이름은 text-sm(13px), 값은 text-lg(17px)로 늘 같다.
// 값은 골드색이고, 값 안에 따로 색이 필요한 칸(가방 백분율)은 값 안에서 정한다.
export default function HudStat({ glyph, label, children }: {
  glyph: GlyphId; label: string; children: ReactNode;
}) {
  return (
    <span className="flex flex-col items-center justify-center gap-1.5 whitespace-nowrap">
      {/* 끝의 공백은 의도적이다: 두 행이 붙어 textContent가 "골드60"이 되면 HUD를
          문자열로 읽는 테스트가 값을 못 찾는다. 지우지 말 것. */}
      <span className="flex items-center gap-1 text-sm leading-none text-text-dim">
        <PixelIcon glyph={glyph} size={12} />{label}{' '}
      </span>
      <span className="text-lg leading-none pf-accent text-gold">{children}</span>
    </span>
  );
}
