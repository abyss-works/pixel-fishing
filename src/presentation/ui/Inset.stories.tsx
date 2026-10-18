// 오목한 칸 스토리 — 그림 칸과 구분선 목록.
import type { Meta, StoryObj } from '@storybook/react';
import Inset from './Inset';
import KeyValueRow from './KeyValueRow';

const meta: Meta<typeof Inset> = {
  title: 'UI/Inset',
  component: Inset,
};

export default meta;
type Story = StoryObj<typeof Inset>;

export const Plain: Story = {
  args: { className: 'p-4 text-sm', children: '표면 아래로 파낸 칸' },
};

export const Divided: Story = {
  args: {
    divided: true,
    children: (
      <>
        <KeyValueRow label="가격" value="120G" />
        <KeyValueRow label="잡은 수" value="3마리" />
      </>
    ),
  },
};
