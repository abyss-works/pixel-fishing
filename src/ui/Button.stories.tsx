// 기본 버튼 스토리 — variant 3종 · sm · disabled.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import Button from './Button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  args: { onClick: fn(), children: '버튼' },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {};

export const Primary: Story = {
  args: { variant: 'primary', children: '확정' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: '닫기' },
};

export const Small: Story = {
  args: { size: 'sm', children: '보조' },
};

export const Disabled: Story = {
  args: { variant: 'primary', disabled: true, children: '처리 중' },
};
