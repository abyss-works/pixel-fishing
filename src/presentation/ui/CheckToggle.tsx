import { cx } from './cx';
import PixelIcon from './PixelIcon';

// 체크 한 줄 — 픽셀 체크 아이콘 + 짧은 문구. 켜고 끄는 표시 설정(소식 자동 열기 등) 공용.
// 버튼처럼 보이지 않게 평면으로 두고, 켜졌을 때만 골드로 세운다.
export default function CheckToggle({ checked, onChange, label, className }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx('inline-flex items-center gap-1.5 text-xs cursor-pointer transition',
        checked ? 'text-gold' : 'text-text-dim hover:text-text', className)}
    >
      <PixelIcon glyph={checked ? 'checkOn' : 'checkOff'} size={11} />
      {label}
    </button>
  );
}
