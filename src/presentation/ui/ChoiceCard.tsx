import type { ReactNode } from 'react';
import { cx } from './cx';
import Inset from './Inset';
import { NOTCH_SM, PRESSED_BEVEL } from './notch';
import PixelIcon from './PixelIcon';

// 선택 카드 — 미리보기 그림이 있는 단일 선택지(라디오). 여러 장을 role="radiogroup" 안에 나란히 둔다.
// 위계: 미리보기(무엇이 보이나) > 이름·뱃지(무엇인가) > 설명(xs). 선택되면 골드 테두리와 체크로 세운다.
const BADGE_CLS = {
  기본: 'text-gold border-gold-dark',
  실험: 'text-accent border-accent',
} as const;

export default function ChoiceCard({ selected, onSelect, preview, label, sub, badge, description }: {
  selected: boolean;
  onSelect: () => void;
  /** 미리보기 그림 — 어두운 칸 가운데에 놓인다 */
  preview: ReactNode;
  label: string;
  sub?: string;
  badge?: keyof typeof BADGE_CLS;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        'flex flex-col gap-1.5 p-2 text-left pf-notch border cursor-pointer transition-colors',
        selected ? cx('border-gold bg-surface-2', PRESSED_BEVEL) : 'border-line bg-surface pf-bevel hover:border-gold-dark',
      )}
    >
      <Inset tone="deep" className="flex items-center justify-center gap-1 h-16 w-full overflow-hidden">
        {preview}
      </Inset>
      <div className="flex items-center gap-1.5">
        <PixelIcon glyph={selected ? 'checkOn' : 'checkOff'} size={11}
                   className={selected ? 'text-gold' : 'text-text-dim'} />
        <span className={cx('pf-accent text-base', selected ? 'text-gold' : 'text-text')}>{label}</span>
        {sub && <span className="text-2xs text-text-dim">{sub}</span>}
        {badge && (
          <span className={cx('ml-auto text-2xs px-1 border', NOTCH_SM, BADGE_CLS[badge])}>{badge}</span>
        )}
      </div>
      <p className="text-xs leading-[1.6] text-text-dim whitespace-pre-line">{description}</p>
    </button>
  );
}
