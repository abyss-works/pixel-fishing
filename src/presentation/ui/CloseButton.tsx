import IconButton from './IconButton';
import { cx } from './cx';

// 닫기 X — 모달·패널의 우상단 공통. 부모는 relative여야 한다. 하단 "닫기" 버튼을 대체한다(사용자 결정).
export default function CloseButton({ onClose, className }: { onClose: () => void; className?: string }) {
  return (
    <IconButton glyph="close" size={12} tone="dim" aria-label="닫기"
                className={cx('absolute top-1.5 right-1.5 p-1 hover:text-text', className)}
                onClick={onClose} />
  );
}
