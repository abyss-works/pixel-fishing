// 화살표 버튼 스토리 — 좌우.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import ArrowButton from './ArrowButton';

const meta: Meta<typeof ArrowButton> = {
  title: 'UI/ArrowButton',
  component: ArrowButton,
  args: { onClick: fn() },
};

export default meta;
type Story = StoryObj<typeof ArrowButton>;

export const Prev: Story = {
  args: { dir: -1 },
};

export const Next: Story = {
  args: { dir: 1 },
};

export const Solid: Story = {
  args: { dir: 1, tone: 'solid' },
};

export const Edge: Story = {
  render: args => (
    <div className="relative w-40 h-8 border border-line">
      <ArrowButton {...args} dir={1} tone="edge" className="absolute top-0 bottom-0 right-0 w-4" />
    </div>
  ),
};
