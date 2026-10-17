import { cx } from './cx';

// 구분선 — 가로(기본)는 구역 사이, 세로(vertical)는 한 줄 안의 값이나 칸 사이를 가른다.
// 세로선은 flex 줄에서는 줄 높이만큼 늘어나고, 글자 사이에서는 글자 높이만큼 선다.
export default function Divider({ vertical, className }: { vertical?: boolean; className?: string }) {
  return vertical ? (
    <span aria-hidden="true"
          className={cx('inline-block self-stretch w-px min-h-[0.9em] bg-line align-middle shrink-0', className)} />
  ) : (
    <hr aria-hidden="true" className={cx('border-0 h-px bg-line my-2', className)} />
  );
}
