// 확인 창 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import ConfirmDialog from './ConfirmDialog';

const meta: Meta<typeof ConfirmDialog> = { title: 'UI/ConfirmDialog', component: ConfirmDialog };
export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {
  args: {
    title: '자동 잠금', confirmLabel: '정리하기', onConfirm: () => {}, onCancel: () => {},
    children: <p className="text-sm">가장 큰 물고기 한 마리만 남기고 나머지는 잠금이 풀린다.</p>,
  },
};
