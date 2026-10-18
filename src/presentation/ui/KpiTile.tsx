import { cx } from './cx';
import Inset from './Inset';

// 지표 타일 — 한눈에 읽는 숫자 하나. 이름(보조색) 아래에 값(픽셀 액센트)과 보조 문구가 쌓이는 오목한 칸이다.
// tone은 값의 색이다. gold = 기본 강조, danger = 경고, dim = 0건처럼 신호가 없을 때.
// 값은 한 줄로 두고 넘치면 줄이며(전체 값은 title로 본다), 보조 문구는 줄을 바꿔 모두 보인다.
const TONE = { gold: 'text-gold', danger: 'text-danger', dim: 'text-text-dim' } as const;

export default function KpiTile({ label, value, hint, tone = 'gold' }: {
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <Inset className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
      <span className="text-xs text-text-dim">{label}</span>
      <span className={cx('pf-accent text-lg truncate', TONE[tone])} title={value}>{value}</span>
      {hint && <span className="text-2xs leading-[1.5] text-text-dim">{hint}</span>}
    </Inset>
  );
}
