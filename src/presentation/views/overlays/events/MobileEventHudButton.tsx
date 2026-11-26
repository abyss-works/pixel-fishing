import type { HTMLAttributes } from 'react';
import PixelIcon from '../../../ui/PixelIcon';
import { cx } from '../../../ui/cx';
import MobileHeaderFrame from '../../../ui/hud/MobileHeaderFrame';

// 모바일 이벤트 버튼 - 트로피 아이콘과 하단 '이벤트' 라벨을 담은 정사각형 버튼.
export default function MobileEventHudButton({ open = false, alert = false, className, ...rest }: {
  open?: boolean;
  alert?: boolean;
} & HTMLAttributes<HTMLElement>) {
  return (
    <MobileHeaderFrame
      as="button"
      square
      aria-label="이벤트"
      className={cx(
        'relative inline-flex flex-col items-center justify-center gap-0.5 cursor-pointer',
        open ? 'text-gold' : 'text-text-dim hover:text-gold',
        className,
      )}
      {...rest}
    >
      <PixelIcon glyph="trophy" size={16} />
      <span className="text-[9px] font-bold leading-none tracking-tight" aria-hidden="true">이벤트</span>
      {alert && !open && <span className="absolute right-1 top-1 size-[7px] bg-danger" aria-hidden="true" data-alert="true" />}
    </MobileHeaderFrame>
  );
}
