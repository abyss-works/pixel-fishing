import type { DailyFortune, FortuneKind } from '../../../../game/rules/fortune';
import {
  FORTUNE_INDEX_LABEL,
  FORTUNE_KIND,
  FORTUNE_PIPS,
  formatFortuneDay,
  fortuneEffectNote,
} from '../../../../features/fortune/model/fortune';
import { cx } from '../../../ui/cx';
import Inset from '../../../ui/Inset';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';
import { HighlightRarityText } from '../../../ui/fish/RarityTag';

/** 종류별 모티프와 강조 색 — 풍어운은 하늘, 재물운은 골드, 그림자 운은 에픽 */
const MOTIF: Record<FortuneKind, { glyph: GlyphId; tone: string }> = {
  fish: { glyph: 'fish', tone: 'text-accent' },
  gold: { glyph: 'coin', tone: 'text-gold' },
  shadow: { glyph: 'fish', tone: 'text-epic' },
};

/** 종류별 아이콘 */
export function FortuneMotifIcon({ kind, size = 28 }: { kind: FortuneKind; size?: number }) {
  const motif = MOTIF[kind];
  return <PixelIcon glyph={motif.glyph} size={size} className={motif.tone} />;
}

/** 지수 칸: 최댓값만큼 칸을 그리고 지수만큼 채운다 */
export function IndexPips({ index, compact = false }: { index: number; compact?: boolean }) {
  return (
    <span className={cx('flex items-center', compact ? 'gap-0.5' : 'gap-1')} aria-hidden="true">
      {Array.from({ length: FORTUNE_PIPS }, (_, i) => (
        <span
          key={i}
          className={cx('inline-block', compact ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5', i < index ? 'bg-gold' : 'bg-line')}
        />
      ))}
    </span>
  );
}

/** 지수 핍과 등급 라벨 */
export function FortuneIndexMeter({ index }: { index: DailyFortune['index'] }) {
  const indexLabel = FORTUNE_INDEX_LABEL[index];
  return (
    <span className="inline-flex items-center justify-center gap-2 text-sm" aria-label={`지수 ${index}, ${indexLabel}`}>
      <span className="text-text-dim">지수</span>
      <IndexPips index={index} />
      <span className="pf-accent text-gold">{index}</span>
      <span className="text-xs text-text-dim">{indexLabel}</span>
    </span>
  );
}

/** 강도 5칸 막대와 강도 등급 — 지수 단어와 중복 숫자 없이 강도만 간결하게 표시한다 */
export function FortuneStrength({ index }: { index: DailyFortune['index'] }) {
  const indexLabel = FORTUNE_INDEX_LABEL[index];
  return (
    <span className="inline-flex items-center gap-2 flex-wrap" aria-label={`강도 ${indexLabel}`}>
      <IndexPips index={index} />
      <span className="text-xs text-text-dim">{indexLabel}</span>
    </span>
  );
}

/** 오늘의 운세 요약 배너 — 달력 창과 게스트 안내에서 함께 쓴다 */
export function TodayFortuneBanner({ fortune, showDate = false }: { fortune: DailyFortune; showDate?: boolean }) {
  const kind = FORTUNE_KIND[fortune.kind];
  return (
    <Inset tone="light" border="accent" className="px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5 min-w-0">
        <FortuneMotifIcon kind={fortune.kind} size={28} />
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gold">{`오늘의 ${kind.name}`}</span>
            {showDate && <span className="text-2xs text-text-dim">{formatFortuneDay(fortune.day)}</span>}
          </div>
          <span className="text-xs text-text-dim">
            <HighlightRarityText text={fortuneEffectNote(fortune)} />
          </span>
        </div>
      </div>
      <FortuneIndexMeter index={fortune.index} />
    </Inset>
  );
}
