import { cx } from '../../ui/cx';

// 미니 바 — 차트 라이브러리 없이 div 폭으로 스케일을 보여주는 1차원 막대(런타임 의존성
// 최소 원칙). ratio는 0~1, 넘치면 클램프한다. 용도: 사다리 표 셀 안의 상대 크기 암시.
export default function MiniBar({ ratio, className = 'bg-gold' }: {
  /** 0~1 (열 전체 최댓값 기준 등) */
  ratio: number;
  className?: string;
}) {
  const w = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) * 100;
  return (
    <div className="h-1 bg-surface-2 rounded-sm overflow-hidden mt-0.5" aria-hidden="true">
      <div className={cx('h-full', className)} style={{ width: `${w}%` }} />
    </div>
  );
}
