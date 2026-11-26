import type { HTMLAttributes } from 'react';
import PixelIcon from '../../../ui/PixelIcon';
import { cx } from '../../../ui/cx';
import HeaderFrame from '../../../ui/hud/HeaderFrame';

// 이벤트 버튼 - 트로피 아이콘과 하단 '이벤트' 라벨을 담은 정사각형 버튼.
// 알림 점(alert)이 켜지면 우상단에 빨간 점을 찍고, 열린 동안에는 감춘다.
export default function EventHudButton({ open = false, alert = false, className, ...rest }: {
  open?: boolean;
  alert?: boolean;
} & HTMLAttributes<HTMLElement>) {
  return (
    <HeaderFrame
      as="button"
      square
      aria-label="이벤트"
      className={cx(
        'relative inline-flex flex-col items-center justify-center gap-1 @max-[640px]:gap-0.5 cursor-pointer',
        open ? 'text-gold' : 'text-text-dim hover:text-gold',
        className,
      )}
      {...rest}
    >
      <PixelIcon glyph="trophy" size={18} className="@max-[640px]:w-4 @max-[640px]:h-4" />
      <span className="text-[10px] @max-[640px]:text-[9px] font-bold leading-none tracking-tight" aria-hidden="true">이벤트</span>
      {alert && !open && <span className="absolute right-1 top-1 size-[7px] bg-danger" aria-hidden="true" data-alert="true" />}
    </HeaderFrame>
  );
}
