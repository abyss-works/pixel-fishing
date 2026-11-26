import type { DailyFortune, FortuneKind } from '../../../../game/rules/fortune';
import {
  FORTUNE_INDEX_LABEL,
  FORTUNE_PIPS,
} from '../../../../features/fortune/model/fortune';
import { cx } from '../../../ui/cx';
import PixelIcon from '../../../ui/PixelIcon';
import { FORTUNE_TONE, fortuneGlyphOf } from './fortuneTone';

/** 종류·강도별 운세 모티프 아이콘 */
export function FortuneMotifIcon({
  kind,
  index,
  size = 28,
  dimmed = false,
  className,
}: {
  kind: FortuneKind;
  index?: DailyFortune['index'];
  size?: number;
  dimmed?: boolean;
  className?: string;
}) {
  const glyph = fortuneGlyphOf(kind, index);
  const tone = dimmed ? 'text-text-dim grayscale brightness-75' : FORTUNE_TONE[kind];
  return <PixelIcon glyph={glyph} size={size} className={cx(tone, 'shrink-0', className)} />;
}

/** 강도 칸: 최댓값만큼 칸을 그리고 강도만큼 채운다 */
export function IndexPips({ index, compact = false }: { index: DailyFortune['index']; compact?: boolean }) {
  return (
    <span className={cx('inline-flex items-center', compact ? 'gap-0.5' : 'gap-1')} aria-hidden="true">
      {Array.from({ length: FORTUNE_PIPS }, (_, i) => (
        <span
          key={i}
          className={cx(
            'inline-block border',
            compact ? 'w-1.5 h-2.5' : 'w-2 h-3',
            i < index ? 'bg-gold border-gold-dark' : 'bg-surface border-line-dim',
          )}
        />
      ))}
    </span>
  );
}

/** 점괘첩 타일용 4px 미니 5칸 강도 막대 */
export function MiniIndexPips({ index }: { index: DailyFortune['index'] }) {
  return (
    <span className="inline-flex items-center gap-px shrink-0" aria-hidden="true">
      {Array.from({ length: FORTUNE_PIPS }, (_, i) => (
        <span
          key={i}
          className={cx('inline-block size-1', i < index ? 'bg-gold' : 'bg-line')}
        />
      ))}
    </span>
  );
}

/** 운세 강도 핍과 등급 라벨 — 중복 숫자 표현 없이 강도를 전한다 */
export function FortuneStrength({ index, compact = false }: { index: DailyFortune['index']; compact?: boolean }) {
  const label = FORTUNE_INDEX_LABEL[index];
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`강도 ${label}`}>
      <IndexPips index={index} compact={compact} />
      <span className="text-xs mobile:text-2xs mobile:leading-tight font-bold text-gold">{label}</span>
    </span>
  );
}

/** 오늘의 운세 점수 — 테두리 없는 금빛 네잎클로버와 숫자만 간결히 둔다 */
export function FortuneScore({
  score,
  compact = false,
  className,
}: {
  score: number;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-label={`운세 점수 ${score}점`}
      className={cx('inline-flex items-center gap-1 shrink-0', className)}
    >
      <PixelIcon glyph="clover" size={compact ? 11 : 14} className="text-gold shrink-0" />
      <span className={cx('pf-accent font-bold text-gold leading-none', compact ? 'text-xs' : 'text-base mobile:text-sm')}>
        {score}
      </span>
    </span>
  );
}
