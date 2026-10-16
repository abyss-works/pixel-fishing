// 닫기 X 스토리 — 부모는 relative여야 한다.
import type { Meta, StoryObj } from '@storybook/react';
import CloseButton from './CloseButton';

const meta: Meta<typeof CloseButton> = { title: 'UI/CloseButton', component: CloseButton };
export default meta;
type Story = StoryObj<typeof CloseButton>;

export const Default: Story = {
  render: () => <div className="relative w-40 h-16 border border-line"><CloseButton onClose={() => {}} /></div>,
};
