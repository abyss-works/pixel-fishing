// 툴팁 버블 스토리 — 화면 오른쪽 끝과 아래 끝에 붙은 요소에서도 버블이 화면 안으로 들어온다.
import type { Meta, StoryObj } from '@storybook/react';
import TooltipBubble from './TooltipBubble';

const meta: Meta<typeof TooltipBubble> = { title: 'UI/TooltipBubble', component: TooltipBubble };
export default meta;
type Story = StoryObj<typeof TooltipBubble>;

export const Default: Story = {
  args: { anchor: { left: 40, top: 40, bottom: 55 }, children: '왕관은 같은 형태에서 가장 큰 개체예요.' },
};

export const RightEdge: Story = {
  args: { anchor: { left: 4000, top: 40, bottom: 55 }, children: '오른쪽 공간이 모자라면 화면 안쪽으로 당겨요.' },
};
