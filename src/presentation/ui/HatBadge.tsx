import { resolveHatDisplay } from '../../features/wardrobe/model/wardrobe';
import { cx } from './cx';
import { NOTCH_SM } from './notch';
import PersonSprite from './PersonSprite';
import PixelIcon from './PixelIcon';

/** 모자 배지 — 우편 첨부, 관리자 발송 요약 등에서 공용으로 쓴다. */
export default function HatBadge({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const info = resolveHatDisplay(id);
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 shrink-0 max-w-full whitespace-nowrap border border-gold/60 bg-bg px-1.5 py-0.5 text-xs text-text',
        NOTCH_SM,
        className,
      )}
    >
      {info.look ? (
        <PersonSprite headOnly look={info.look} scale={2} className="shrink-0" />
      ) : (
        <PixelIcon glyph="star" size={12} className="shrink-0 text-gold" />
      )}
      <span className="truncate">모자 {info.name}</span>
    </span>
  );
}
