// HUD 칩 스토리 — 값 표시(활성 미끼), 누르는 칩(접속 수), 낮은 칩(시계).
import type { Meta, StoryObj } from '@storybook/react';
import HudChip from './HudChip';
import PixelIcon from '../PixelIcon';

const meta: Meta<typeof HudChip> = { title: 'Overlays/HudChip', component: HudChip };
export default meta;
type Story = StoryObj<typeof HudChip>;

export const Value: Story = {
  render: () => (
    <HudChip className="w-fit">
      <span className="size-2.5 bg-accent" />
      <span className="pf-accent text-sm leading-none text-gold">12</span>
    </HudChip>
  ),
};

export const Button: Story = {
  render: () => (
    <HudChip className="w-fit" onClick={() => {}} aria-label="이 바다의 플레이어 3명, 목록 열기">
      <PixelIcon glyph="people" size={12} />
      <span className="pf-accent leading-none">3</span>
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
