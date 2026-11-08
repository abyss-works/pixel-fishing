import type { ReactNode } from 'react';
import PixelIcon from '../PixelIcon';
import type { GlyphId } from '../PixelIcon';

// HUD 값 칸 - 모바일 레이아웃의 자원 바 1행이 쓰는 "아이콘 | 값" 가로 한 줄 한 칸.
// 이름(label)은 화면 글자로 그리지 않고 읽는 이에게만 보이는 글자(sr-only)로 두며,
// 눈으로 읽는 설명은 호출부가 툴팁으로 단다.
// sr-only 이름 끝의 공백은 의도적이다: 이름과 값이 붙어 textContent가 "골드60"이 되면 HUD를 문자열로 읽는 테스트가 값을 못 찾는다.
// 값은 픽셀 폰트(고정폭)이고 글자는 스테이지 폭이 380px 미만이면 12px, 380px 이상이면 13px이다.
// 아이콘 크기는 12px(12칸 격자의 1배)라 픽셀 모서리가 흐려지지 않는다.
// 360 폭의 가장 긴 값이 한 줄에 들어가는 계산은 모바일 자원 바 주석에 있다.
export default function MobileHudStat({ glyph, label, children }: {
  glyph: GlyphId; label: string; children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      <PixelIcon glyph={glyph} className="size-3 shrink-0 align-baseline text-text-dim" />
      <span className="sr-only">{label}{' '}</span>
      <span className="pf-accent leading-none text-[12px] @min-[380px]:text-[13px] text-gold">{children}</span>
    </span>
  );
}
