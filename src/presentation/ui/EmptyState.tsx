import type { ReactNode } from 'react';
import { cx } from './cx';
import Inset from './Inset';
import PixelIcon from './PixelIcon';
import type { GlyphId } from './PixelIcon';

// 공용 빈 상태 안내 — 목록이 비었을 때 오목한 칸 안에 안내 문구와 선택적 다음 행동 버튼을 둔다.
export default function EmptyState({
  glyph,
  iconTone = 'dim',
  message,
  action,
  framed = true,
  className,
}: {
  glyph?: GlyphId;
  iconTone?: 'dim' | 'danger';
  message: ReactNode;
  action?: ReactNode;
  /** 바깥이 이미 오목한 칸(Inset)일 때 false로 이중 중첩을 막는다 */
  framed?: boolean;
  className?: string;
}) {
  const content = (
    <>
      {glyph && <PixelIcon glyph={glyph} size={18} className={iconTone === 'danger' ? 'text-danger' : 'text-text-dim'} />}
      <div>{message}</div>
      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
    </>
  );
  const layout = cx('flex flex-col items-center justify-center gap-2 p-6 text-center text-xs text-text-dim', className);
  if (!framed) return <div className={layout}>{content}</div>;
  return (
    <Inset tone="deep" className={layout}>
      {content}
    </Inset>
  );
}
