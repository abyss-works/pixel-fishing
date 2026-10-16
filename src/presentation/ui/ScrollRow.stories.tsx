// 가로 넘김 줄 스토리 — 넘치면 양옆 화살표가 생긴다.
import type { Meta, StoryObj } from '@storybook/react';
import ScrollRow from './ScrollRow';

const meta: Meta<typeof ScrollRow> = { title: 'UI/ScrollRow', component: ScrollRow };
export default meta;
type Story = StoryObj<typeof ScrollRow>;

export const Overflowing: Story = {
  args: { children: Array.from({ length: 12 }, (_, i) => <span key={i} className="shrink-0 px-3">항목 {i + 1}</span>) },
};
