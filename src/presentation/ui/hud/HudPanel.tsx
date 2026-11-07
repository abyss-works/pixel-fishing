import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';

// HUD 패널 - 캔버스 위에 뜨는 알림 카드, 낚시 상태 띠, 획득 카드, 헤더 틀의 공통 틀.
// 반투명 바탕(배경 72%와 흐림)에 노치와 베벨을 두른다. tone gold는 처리할 일이 있는 알림처럼
// 다른 HUD와 갈라 보일 카드에 쓰는 낮은 채도의 골드 테두리다. 다른 테두리색은 호출부가 className으로 준다.
// as="button"이면 누르는 틀(버튼)로 그린다.
const TONE = {
  line: 'border-line',
  gold: 'border-[color-mix(in_oklab,var(--c-gold)_60%,var(--c-line))]',
  none: '',
} as const;

export default function HudPanel({ as: Tag = 'div', tone = 'line', className, children, ...rest }: {
  as?: 'div' | 'button';
  tone?: keyof typeof TONE;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag {...(Tag === 'button' ? { type: 'button' as const } : {})}
         className={cx('pf-glass pf-notch pf-bevel border-2', TONE[tone], className)} {...rest}>
      {children}
    </Tag>
  );
}
