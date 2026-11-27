import type { HTMLAttributes } from 'react';
import PixelIcon from '../../../ui/PixelIcon';
import { cx } from '../../../ui/cx';
import HeaderFrame from '../../../ui/hud/HeaderFrame';
import { HEADER_BUTTON_GAP_CLASS, HEADER_BUTTON_ICON_CLASS, HEADER_BUTTON_LABEL_CLASS } from '../../../ui/hud/headerTier';

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
        'relative inline-flex flex-col items-center justify-center cursor-pointer',
        HEADER_BUTTON_GAP_CLASS,
        open ? 'text-gold' : 'text-text-dim hover:text-gold',
        className,
      )}
      {...rest}
    >
      <PixelIcon glyph="trophy" size={18} className={HEADER_BUTTON_ICON_CLASS} />
      <span className={cx(HEADER_BUTTON_LABEL_CLASS, 'font-bold leading-none tracking-tight')} aria-hidden="true">이벤트</span>
      {alert && !open && <span className="absolute right-1 top-1 size-[7px] bg-danger" aria-hidden="true" data-alert="true" />}
    </HeaderFrame>
  );
}
