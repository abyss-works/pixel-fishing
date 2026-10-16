import { cx } from './cx';

// 색 칸 — 그림이 없는 항목(미끼 등)을 데이터의 도트색으로 세우는 픽셀 칸. big은 상세 머리용.
export default function ColorSwatch({ color, big }: { color: string; big?: boolean }) {
  return (
    <span aria-hidden="true" className={cx('shrink-0 border-2 border-line pf-frame', big ? 'size-16' : 'size-5')}
          style={{ backgroundColor: color }} />
  );
}
