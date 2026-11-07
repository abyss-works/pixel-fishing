import type { HTMLAttributes } from 'react';
import PixelIcon from '../PixelIcon';
import { cx } from '../cx';
import HeaderFrame from './HeaderFrame';

// 메뉴 버튼 - 햄버거 아이콘 하나짜리 정사각형 버튼. 틀과 크기는 헤더 틀(HeaderFrame)이 정한다.
// alert면 모서리에 빨간 점을 찍는다(펼친 동안은 점을 감춘다). open이면 아이콘이 골드다.
export default function HudMenuButton({ open = false, alert = false, className, ...rest }: {
  open?: boolean;
  alert?: boolean;
} & HTMLAttributes<HTMLElement>) {
  return (
    <HeaderFrame as="button" square
                 className={cx('relative inline-flex items-center justify-center cursor-pointer',
                               open ? 'text-gold' : 'text-text-dim hover:text-gold', className)}
                 {...rest}>
      <PixelIcon glyph="menu" size={20} />
      {alert && !open && <span className="absolute right-1 top-1 size-[7px] bg-danger" aria-hidden="true" />}
    </HeaderFrame>
  );
}
