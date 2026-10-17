// HUD 알약 스토리 — 기본(활성 미끼 같은 값 표시)과 낮은 알약(시계).
import type { Meta, StoryObj } from '@storybook/react';
import HudChip from './HudChip';
import PixelIcon from '../PixelIcon';

const meta: Meta<typeof HudChip> = { title: 'Overlays/HudChip', component: HudChip };
export default meta;
type Story = StoryObj<typeof HudChip>;

export const Value: Story = {
  render: () => (
    <HudChip className="w-fit">
      <span className="w-2.5 h-2.5 rounded-full border border-line bg-accent" />
      <span className="pf-accent text-sm leading-none text-gold">12</span>
    </HudChip>
  ),
};

export const Small: Story = {
  render: () => (
    <HudChip size="sm" className="w-fit">
      <PixelIcon glyph="sun" size={11} className="text-gold" />
      <span className="pf-accent text-xs leading-none text-text">08:30</span>
    </HudChip>
  ),
};
