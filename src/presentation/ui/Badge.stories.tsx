// 꼬리표 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import Badge from './Badge';

const meta: Meta<typeof Badge> = { title: 'UI/Badge', component: Badge };
export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = { args: { children: '할인 25%' } };
