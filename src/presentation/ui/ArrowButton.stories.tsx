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
