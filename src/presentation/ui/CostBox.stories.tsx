// 확정 위 잔액 상자 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import CostBox from './CostBox';
import CostLine from './CostLine';

const meta: Meta<typeof CostBox> = { title: 'UI/CostBox', component: CostBox };
export default meta;
type Story = StoryObj<typeof CostBox>;

export const Default: Story = { args: { children: <CostLine size="lg" have={12000} delta={-3000} /> } };
