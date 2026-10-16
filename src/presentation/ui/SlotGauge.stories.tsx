// 칸 게이지 스토리 — 체력·도주.
import type { Meta, StoryObj } from '@storybook/react';
import SlotGauge from './SlotGauge';

const meta: Meta<typeof SlotGauge> = { title: 'UI/SlotGauge', component: SlotGauge };
export default meta;
type Story = StoryObj<typeof SlotGauge>;

export const Health: Story = { args: { label: '체력', total: 9, filled: 6, tone: 'danger' } };
export const Escape: Story = { args: { label: '도주', total: 3, filled: 1, tone: 'dim' } };
