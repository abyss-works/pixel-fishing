import { cx } from './cx';

// 칸 게이지 — 이름 + 칸 n개 중 filled개를 채운다. 체력(빨강)·도주(회색)처럼 칸 수가 작은 자원.
// 연속 값(진행률)은 막대를 쓴다. 접근성 이름은 "이름 채움/전체"다.
export default function SlotGauge({ label, total, filled, tone }: {
  label: string; total: number; filled: number; tone: 'danger' | 'dim' | 'gold';
}) {
  const fill = tone === 'danger' ? 'bg-danger' : tone === 'gold' ? 'bg-gold' : 'bg-text-dim';
  return (
    <span className="flex items-center gap-2" aria-label={`${label} ${filled}/${total}`}>
      <span className="w-8 text-left text-xs text-text-dim">{label}</span>
      <span className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cx('w-4 h-3 border border-line', i < filled && fill)} />
        ))}
      </span>
    </span>
  );
}
