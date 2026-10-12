// 투명 아이콘 버튼 스토리 — tone 3종.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import IconButton from './IconButton';

const meta: Meta<typeof IconButton> = {
  title: 'UI/IconButton',
  component: IconButton,
  args: { onClick: fn() },
};

export default meta;
type Story = StoryObj<typeof IconButton>;

export const Locked: Story = {
  args: { glyph: 'lock', size: 14, tone: 'gold', 'aria-label': '잠금 해제' },
};

export const Unlocked: Story = {
  args: { glyph: 'lockOpen', size: 14, tone: 'dim', 'aria-label': '잠금' },
};

export const Inherit: Story = {
  args: { glyph: 'caretRight', size: 10, children: '펼치기' },
};
