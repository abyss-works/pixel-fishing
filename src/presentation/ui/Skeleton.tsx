import { cx } from './cx';

// 스켈레톤 - 데이터를 기다리는 동안 내용이 들어올 자리를 맥박처럼 깜빡이는 막대로 채운다.
// 크기는 호출부가 className(높이, 폭)으로 준다. 읽는 이에게는 호출부가 role="status"와 안내 문구를 따로 단다.
export default function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('bg-line/50 animate-pulse', className)} />;
}
