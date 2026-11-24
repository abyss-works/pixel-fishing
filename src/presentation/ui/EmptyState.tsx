import type { ReactNode } from 'react';
import { cx } from './cx';
import Inset from './Inset';
import PixelIcon from './PixelIcon';
import type { GlyphId } from './PixelIcon';

// 공용 빈 상태 안내 — 목록이 비었을 때 오목한 칸 안에 안내 문구와 선택적 다음 행동 버튼을 둔다.
export default function EmptyState({
  glyph,
  message,
  action,
  className,
}: {
  glyph?: GlyphId;
  message: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Inset tone="deep" className={cx('flex flex-col items-center justify-center gap-2 p-6 text-center text-xs text-text-dim', className)}>
      {glyph && <PixelIcon glyph={glyph} size={18} className="text-text-dim" />}
      <div>{message}</div>
      {action}
    </Inset>
  );
}
