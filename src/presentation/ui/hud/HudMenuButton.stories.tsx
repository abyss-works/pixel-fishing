// 메뉴 버튼 스토리 — 접힘, 알림 있음, 펼침.
import type { Meta, StoryObj } from '@storybook/react';
import HudMenuButton from './HudMenuButton';

const meta: Meta<typeof HudMenuButton> = {
  title: 'Overlays/HudMenuButton',
  component: HudMenuButton,
  decorators: [Story => <div className="p-4 bg-[#0e2c4b] w-fit"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof HudMenuButton>;

export const Closed: Story = { args: { 'aria-label': '메뉴 열기' } };
export const Alert: Story = { args: { alert: true, 'aria-label': '메뉴 열기, 새 알림 있음' } };
export const Open: Story = { args: { open: true, 'aria-label': '메뉴 닫기' } };
