import { cx } from './cx';

// 색 칸 — 그림이 없는 항목(미끼 등)을 데이터의 도트색으로 세우는 네모난 픽셀 칸. 기본은 목록 행용 12px, big은 상세 머리용 28px.
export default function ColorSwatch({ color, big }: { color: string; big?: boolean }) {
  return (
    <span aria-hidden="true" className={cx('block shrink-0', big ? 'size-7' : 'size-3')}
          style={{ backgroundColor: color }} />
  );
}
