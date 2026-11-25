import { resolveItemDisplay } from '../../features/inventory/model/items';
import { cx } from './cx';
import Frame from './Frame';
import ItemSprite from './ItemSprite';
import { NOTCH_SM } from './notch';
import PixelIcon from './PixelIcon';

/** 스택 아이템 배지 — 우편 첨부, 수령 목록, 관리자 발송 요약 등에서 공용으로 쓴다.
 *  onClick을 넘기면 눌러서 상세를 열 수 있는 버튼 배지로 그린다. */
export default function ItemBadge({
  id,
  qty,
  onClick,
  className,
}: {
  id: string;
  qty?: number;
  onClick?: () => void;
  className?: string;
}) {
  const info = resolveItemDisplay(id);
  const content = (
    <>
      {info?.spriteKind ? (
        <ItemSprite kind={info.spriteKind} id={id} preset="row" className="shrink-0" />
      ) : (
        <PixelIcon glyph="gem" size={12} className="shrink-0 text-accent" />
      )}
      <span>{info?.name ?? id}</span>
      {qty !== undefined && (
        <span className="pf-accent text-2xs text-gold">×{qty.toLocaleString('ko-KR')}</span>
      )}
    </>
  );
  const baseClass = cx(
    'inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap border border-line bg-bg px-1.5 py-0.5 text-xs text-text',
    NOTCH_SM,
    onClick && 'cursor-pointer hover:border-accent hover:bg-surface-2',
    className,
  );
  if (onClick) {
    return (
      <Frame as="button" type="button" onClick={onClick} className={baseClass}>
        {content}
      </Frame>
    );
  }
  return (
    <span className={baseClass}>
      {content}
    </span>
  );
}
