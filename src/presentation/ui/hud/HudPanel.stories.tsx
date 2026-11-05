// HUD 패널 스토리 — 기본 테두리와 골드 테두리(처리할 일이 있는 알림).
import type { Meta, StoryObj } from '@storybook/react';
import HudPanel from './HudPanel';

const meta: Meta<typeof HudPanel> = {
  title: 'Overlays/HudPanel',
  component: HudPanel,
  decorators: [Story => <div className="w-[292px] p-3 bg-surface"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof HudPanel>;

export const Line: Story = {
  render: () => <HudPanel className="px-2.5 py-2 text-xs">흔적이 다른 구역에 남아 있어요.</HudPanel>,
};

export const Gold: Story = {
  render: () => <HudPanel tone="gold" className="px-2.5 py-2 text-xs">수면 아래로 커다란 그림자가 지나갔다.</HudPanel>,
};
