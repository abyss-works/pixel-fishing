import type { DailyFortune, FortuneKind } from '../../../../game/rules/fortune';
import type { GlyphId } from '../../../ui/PixelIcon';

/** 종류별 시맨틱 강조 색상 — 풍어/입질/기운은 하늘, 재물/월척/명성/금비늘/만선대길은 골드, 그림자는 네임드, 돌연변이/신기루는 돌연변이 자홍, 밤운은 은회색 */
export const FORTUNE_TONE: Record<FortuneKind, string> = {
  fish: 'text-accent',
  gold: 'text-gold',
  bite: 'text-accent',
  big: 'text-gold',
  fame: 'text-gold',
  shadow: 'text-named',
  mutation: 'text-mutation',
  night: 'text-common',
  energy: 'text-accent',
  'golden-scale': 'text-gold',
  mirage: 'text-mutation',
  'grand-catch': 'text-gold',
};

const MOTIF_GLYPH: Record<FortuneKind, GlyphId> = {
  fish: 'wave',
  gold: 'coin',
  bite: 'clock',
  big: 'crown',
  fame: 'star',
  shadow: 'target',
  mutation: 'sparkle',
  night: 'moon',
  energy: 'gem',
  'golden-scale': 'scale',
  mirage: 'mirage',
  'grand-catch': 'treasure',
};

/** 종류와 강도에 맞는 모티프 글리프 반환 */
export function fortuneGlyphOf(kind: FortuneKind, index?: DailyFortune['index']): GlyphId {
  if (kind === 'night' && index === 5) return 'fullmoon';
  return MOTIF_GLYPH[kind];
}

/** 종류별 시맨틱 강조 색 반환 */
export function fortuneToneOf(kind: FortuneKind): string {
  return FORTUNE_TONE[kind];
}
