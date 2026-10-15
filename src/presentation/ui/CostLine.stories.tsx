// 잔액 줄 — 지출·수입·하한 조건·부족 상태.
import type { Meta, StoryObj } from '@storybook/react';
import CostLine from './CostLine';

const meta: Meta<typeof CostLine> = { title: 'UI/CostLine', component: CostLine };
export default meta;
type Story = StoryObj<typeof CostLine>;

export const Spend: Story = { args: { have: 1200, delta: -800 } };
export const Income: Story = { args: { have: 1200, delta: 60 } };
export const Short: Story = { args: { have: 500, delta: -800 } };
export const WithRequirement: Story = {
  args: { have: 32000, delta: -15000, requirement: { label: '명성', need: 11000, have: 8400 } },
};
