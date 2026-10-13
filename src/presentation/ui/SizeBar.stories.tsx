// 크기 막대 스토리 — 백분위별 채움.
import type { Meta, StoryObj } from '@storybook/react';
import SizeBar from './SizeBar';

const meta: Meta<typeof SizeBar> = {
  title: 'UI/SizeBar',
  component: SizeBar,
};

export default meta;
type Story = StoryObj<typeof SizeBar>;

export const Small: Story = {
  args: { percentile: 80 },
};

export const Mid: Story = {
  args: { percentile: 45 },
};

export const BigCatch: Story = {
  args: { percentile: 5 },
};
