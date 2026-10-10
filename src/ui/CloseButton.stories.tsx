// 닫기 버튼 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import CloseButton from './CloseButton';

const meta: Meta<typeof CloseButton> = {
  title: 'UI/CloseButton',
  component: CloseButton,
  args: { onClick: fn() },
};

export default meta;
type Story = StoryObj<typeof CloseButton>;

export const Default: Story = {};
