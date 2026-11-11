import { cx } from './cx';
import PixelIcon from './PixelIcon';

// 체크 한 줄 — 픽셀 체크 아이콘 + 짧은 문구. 켜고 끄는 표시 선택 공용.
// 버튼처럼 보이지 않게 평면으로 두고, 켜졌을 때만 골드로 세운다. 쓸 수 없으면 회색으로 두고 누를 수 없다.
export default function CheckToggle({ checked, onChange, label, disabled = false, className }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('inline-flex items-center gap-1.5 text-xs transition',
        disabled ? 'text-line cursor-not-allowed' : checked ? 'text-gold cursor-pointer' : 'text-text-dim hover:text-text cursor-pointer', className)}
    >
      <PixelIcon glyph={checked && !disabled ? 'checkOn' : 'checkOff'} size={11} />
      {label}
    </button>
  );
}
