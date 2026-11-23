import IconButton from './IconButton';
import PixelIcon from './PixelIcon';
import { cx } from './cx';
import type { MessageTone } from './hud/messageFeed';

export interface FloatingToastItem {
  id: number;
  text: string;
  tone: MessageTone;
}

/** 모달이 열려 있을 때 스테이지 창 위(--z-toast)에 띄우는 비차단 1줄 알림 배너.
 *  원격 이동·바로 착용 등 부가 행동 버튼은 두지 않고 닫기(X)만 둔다. */
export default function FloatingToastLayer({
  toasts,
  onDismiss,
}: {
  toasts: readonly FloatingToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 z-(--z-toast) flex w-[min(560px,calc(100%-24px))] flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          role="status"
          className={cx(
            'pointer-events-none pf-notch flex items-center justify-between gap-2 border-2 bg-surface px-3 py-2',
            'shadow-[0_8px_24px_rgba(0,0,0,0.65),inset_1px_1px_0_var(--bevel-lo),inset_-1px_-1px_0_var(--bevel-hi)]',
            t.tone === 'gold' ? 'border-gold' : t.tone === 'warn' ? 'border-danger' : 'border-accent',
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <PixelIcon
              glyph={t.tone === 'gold' ? 'crown' : 'sparkle'}
              size={14}
              className={cx(
                'shrink-0',
                t.tone === 'gold' ? 'text-gold' : t.tone === 'warn' ? 'text-danger' : 'text-accent',
              )}
            />
            <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-text break-keep break-words">
              {t.text}
            </span>
          </div>
          <IconButton
            glyph="close"
            size={10}
            tone="dim"
            aria-label="알림 닫기"
            className="pointer-events-auto shrink-0 p-1 hover:text-text"
            onClick={() => onDismiss(t.id)}
          />
        </div>
      ))}
    </div>
  );
}
