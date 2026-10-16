// 프레임 스토리 — 기본 틀과 구분선 목록 틀.
import type { Meta, StoryObj } from '@storybook/react';
import Frame from './Frame';

const meta: Meta<typeof Frame> = { title: 'UI/Frame', component: Frame };
export default meta;
type Story = StoryObj<typeof Frame>;

export const Basic: Story = { args: { className: 'px-3 py-2', children: '노치·베벨 틀 안의 내용.' } };
export const Divided: Story = {
  render: () => (
    <Frame divided>
      <div className="px-2 py-1.5">첫 줄</div>
      <div className="px-2 py-1.5">둘째 줄</div>
    </Frame>
  ),
};
