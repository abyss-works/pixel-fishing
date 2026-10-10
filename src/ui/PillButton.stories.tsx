// 알약 버튼 스토리 — 활성/기본/비활성.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import PillButton from './PillButton';

const meta: Meta<typeof PillButton> = {
  title: 'UI/PillButton',
  component: PillButton,
  args: { onClick: fn(), children: '활성' },
};

export default meta;
type Story = StoryObj<typeof PillButton>;

export const Default: Story = {};

export const Active: Story = {
  args: { active: true, children: '사용 중' },
};

export const Disabled: Story = {
  args: { disabled: true, children: '보유량 없음' },
};
