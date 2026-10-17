// 구분선 스토리 — 가로 구역 구분과 한 줄 안의 세로 구분.
import type { Meta, StoryObj } from '@storybook/react';
import Divider from './Divider';

const meta: Meta<typeof Divider> = { title: 'UI/Divider', component: Divider };
export default meta;
type Story = StoryObj<typeof Divider>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-60 text-sm">
      <p>위 구역</p>
      <Divider />
      <p>아래 구역</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <span className="inline-flex items-center gap-1.5 pf-accent text-gold">
      1<Divider vertical />1
    </span>
  ),
};
