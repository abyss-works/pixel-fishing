import type { ToastTone } from '../../features/display/model/toastPolicy';
import IconButton from './IconButton';
import PixelIcon from './PixelIcon';
import type { GlyphId } from './PixelIcon';
import { cx } from './cx';
import type { MessageTone } from './hud/messageFeed';

export interface FloatingToastItem {
  id: number;
  text: string;
  tone: ToastTone | MessageTone;
}

const TONE_STYLE: Record<ToastTone, { border: string; icon: GlyphId; iconColor: string }> = {
  gold: { border: 'border-gold', icon: 'crown', iconColor: 'text-gold' },
  accent: { border: 'border-accent', icon: 'sparkle', iconColor: 'text-accent' },
  danger: { border: 'border-danger', icon: 'warn', iconColor: 'text-danger' },
  guild: { border: 'border-guild', icon: 'flag', iconColor: 'text-guild' },
  epic: { border: 'border-epic', icon: 'sparkle', iconColor: 'text-epic' },
  neutral: { border: 'border-line', icon: 'check', iconColor: 'text-text-dim' },
};

function resolveTone(tone: ToastTone | MessageTone): ToastTone {
  if (tone === 'info') return 'accent';
  if (tone === 'warn') return 'danger';
  return tone;
}

/** 화면 전체 오버레이 위(--z-toast)에 띄우는 비차단 1줄 주요 알림 배너.
 *  원격 이동·바로 착용 등 부가 행동 버튼은 두지 않고 닫기(X)만 둔다. */
export default function FloatingToastLayer({
  toasts,
  maxVisible = 3,
  onDismiss,
}: {
  toasts: readonly FloatingToastItem[];
  maxVisible?: number;
  onDismiss: (id: number) => void;
}) {
  const shown = toasts.slice(0, maxVisible);
  if (shown.length === 0) return null;
  return (
    <div
      className={cx(
        'pointer-events-none fixed bottom-3 mobile:bottom-16 left-1/2 -translate-x-1/2 z-(--z-toast)',
        'flex w-[min(560px,calc(100%-24px))] flex-col gap-2 mobile:[&>*:nth-child(n+3)]:hidden',
      )}
    >
      {shown.map(t => {
        const style = TONE_STYLE[resolveTone(t.tone)];
        return (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pointer-events-none pf-notch flex items-center justify-between gap-2 border bg-surface px-3 py-2',
              'shadow-[0_8px_24px_rgba(0,0,0,0.65),inset_1px_1px_0_var(--bevel-lo),inset_-1px_-1px_0_var(--bevel-hi)]',
              style.border,
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <PixelIcon
                glyph={style.icon}
                size={14}
                className={cx('shrink-0', style.iconColor)}
              />
              <span className="min-w-0 flex-1 truncate whitespace-nowrap text-xs font-semibold leading-snug text-text">
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
        );
      })}
    </div>
  );
}
