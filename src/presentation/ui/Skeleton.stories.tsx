// 스켈레톤 스토리 - 한 줄 막대와 카드 모양 묶음.
import type { Meta, StoryObj } from '@storybook/react';
import Skeleton from './Skeleton';

const meta: Meta<typeof Skeleton> = { title: 'UI/Skeleton', component: Skeleton };
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Bar: Story = { args: { className: 'h-4 w-48' } };

export const Card: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-2 bg-surface-2 p-3">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4" />
      <Skeleton className="h-4" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  ),
};
