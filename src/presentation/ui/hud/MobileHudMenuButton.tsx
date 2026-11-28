import type { HTMLAttributes } from 'react';
import { MarkDot } from '../AttentionMark';
import PixelIcon from '../PixelIcon';
import { cx } from '../cx';
import MobileHeaderFrame from './MobileHeaderFrame';

// 메뉴 버튼 - 햄버거 아이콘과 하단 '메뉴' 라벨을 담은 40px 정사각형 버튼. 틀과 크기는 헤더 틀(MobileHeaderFrame)이 정한다.
// mark가 있으면 모서리에 점을 찍는다 - accent는 금색 점(느린 깜빡임), mail은 빨간 점(반짝임). 펼친 동안은 점을 감추고 항목 표식이 대신한다. open이면 아이콘·라벨이 골드다.
export default function MobileHudMenuButton({ open = false, mark = null, className, ...rest }: {
  open?: boolean;
  mark?: 'accent' | 'mail' | null;
} & HTMLAttributes<HTMLElement>) {
  return (
    <MobileHeaderFrame as="button" square
                 className={cx('relative inline-flex flex-col items-center justify-center gap-0.5 cursor-pointer',
                               open ? 'text-gold' : 'text-text-dim hover:text-gold', className)}
                 {...rest}>
      <PixelIcon glyph="menu" size={16} />
      <span className="text-[9px] leading-none tracking-tight" aria-hidden="true">메뉴</span>
      {mark && !open && (mark === 'mail' ? <MarkDot tone="danger" motion="sparkle" /> : <MarkDot tone="gold" motion="blink" />)}
    </MobileHeaderFrame>
  );
}
