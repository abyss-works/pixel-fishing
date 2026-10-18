// 오목한 칸 스토리 — 깊이(밝기) 세 단계와 구분선 목록.
import type { Meta, StoryObj } from '@storybook/react';
import Inset from './Inset';
import KeyValueRow from './KeyValueRow';

const meta: Meta<typeof Inset> = {
  title: 'UI/Inset',
  component: Inset,
};

export default meta;
type Story = StoryObj<typeof Inset>;

export const Base: Story = {
  args: { className: 'p-4 text-sm', children: '기본 깊이 — 바탕과 표면의 중간' },
};

export const Deep: Story = {
  args: { tone: 'deep', className: 'p-4 text-sm', children: '깊은 칸 — 바탕색' },
};

export const Light: Story = {
  args: { tone: 'light', className: 'p-4 text-sm', children: '얕은 칸 — 표면에 가까운 밝기' },
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
