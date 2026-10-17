// 픽셀 아이콘 스토리 — 전 글리프.
import type { Meta, StoryObj } from '@storybook/react';
import PixelIcon from './PixelIcon';
import type { GlyphId } from './PixelIcon';

const GLYPHS: GlyphId[] = [
  'coin', 'star', 'boat', 'rod', 'fish',
  'sun', 'moon',
  'lock', 'lockOpen', 'checkOn', 'checkOff', 'checkPartial',
  'caretRight', 'caretDown',
  'letter', 'key', 'ticket', 'download', 'upload', 'exit', 'close',
  'plus', 'minus',
  'compass', 'backpack', 'book', 'question', 'gear',
];

const meta: Meta<typeof PixelIcon> = {
  title: 'UI/PixelIcon',
  component: PixelIcon,
};

export default meta;

export const All: StoryObj = {
  render: () => (
    <div className="grid grid-cols-5 gap-2 text-text-dim">
      {GLYPHS.map(g => (
        <span key={g} className="flex flex-col items-center gap-1 text-2xs">
          <PixelIcon glyph={g} size={12} />
          {g}
        </span>
      ))}
    </div>
  ),
};
