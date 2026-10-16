// 2열 상세 골격 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import TwoColumn from './TwoColumn';
import Frame from './Frame';

const meta: Meta<typeof TwoColumn> = { title: 'UI/TwoColumn', component: TwoColumn };
export default meta;
type Story = StoryObj<typeof TwoColumn>;

export const Default: Story = {
  args: { children: [<Frame key="l" className="p-3">목록</Frame>, <Frame key="r" className="p-3">상세</Frame>] },
};
