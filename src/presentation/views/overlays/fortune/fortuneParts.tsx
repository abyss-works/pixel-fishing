import type { DailyFortune, FortuneKind } from '../../../../game/rules/fortune';
import {
  FORTUNE_INDEX_LABEL,
  FORTUNE_PIPS,
} from '../../../../features/fortune/model/fortune';
import { cx } from '../../../ui/cx';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';

/** 종류별 모티프와 강조 색 — 풍어운은 하늘, 재물운은 골드, 그림자 운은 네임드 코랄 */
const MOTIF: Record<FortuneKind, { glyph: GlyphId; tone: string }> = {
  fish: { glyph: 'fish', tone: 'text-accent' },
  gold: { glyph: 'coin', tone: 'text-gold' },
  shadow: { glyph: 'target', tone: 'text-named' },
};

/** 종류별 아이콘 */
export function FortuneMotifIcon({ kind, size = 28 }: { kind: FortuneKind; size?: number }) {
  const motif = MOTIF[kind];
  return <PixelIcon glyph={motif.glyph} size={size} className={cx(motif.tone, 'shrink-0')} />;
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

/** 운세 강도 핍과 등급 라벨 — 중복 숫자·지수 표현 없이 강도를 전한다 */
export function FortuneStrength({ index, compact = false }: { index: DailyFortune['index']; compact?: boolean }) {
  const label = FORTUNE_INDEX_LABEL[index];
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`강도 ${label}`}>
      <IndexPips index={index} compact={compact} />
      <span className="text-xs mobile:text-2xs font-bold text-gold">{label}</span>
    </span>
  );
}
