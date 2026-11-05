// HUD 입력 칸 스토리 — 입력, 쓸 수 없는 칸(안내 문구와 이유 툴팁).
import type { Meta, StoryObj } from '@storybook/react';
import HudInput from './HudInput';

const meta: Meta<typeof HudInput> = {
  title: 'Overlays/HudInput',
  component: HudInput,
  decorators: [Story => <div className="flex w-[400px] p-3 bg-surface"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof HudInput>;

export const Input: Story = { args: { placeholder: 'Enter로 채팅', 'aria-label': '채팅 입력' } };

export const Blocked: Story = {
  args: { blocked: { text: '채팅은 계정을 만든 뒤 쓸 수 있어요', reason: '설정 탭의 계정 관리에서 계정을 만들 수 있어요.' } },
};
