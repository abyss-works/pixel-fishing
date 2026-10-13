// 입력칸 스토리 — 기본/소형/비활성.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import TextInput from './TextInput';

const meta: Meta<typeof TextInput> = {
  title: 'UI/TextInput',
  component: TextInput,
  args: { onChange: fn() },
};

export default meta;
type Story = StoryObj<typeof TextInput>;

export const Default: Story = {
  args: { placeholder: '이메일', value: '' },
};

export const Compact: Story = {
  args: { compact: true, type: 'number', placeholder: '0', value: '' },
};

export const Disabled: Story = {
  args: { placeholder: '읽기 전용', value: 'guest', disabled: true },
};
