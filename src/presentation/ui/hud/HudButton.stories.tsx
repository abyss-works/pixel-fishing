// HUD 버튼 스토리 — 기본, 고른 상태(길드 방), 쓸 수 없는 상태.
import type { Meta, StoryObj } from '@storybook/react';
import HudButton from './HudButton';

const meta: Meta<typeof HudButton> = { title: 'Overlays/HudButton', component: HudButton };
export default meta;
type Story = StoryObj<typeof HudButton>;

export const States: Story = {
  render: () => (
    <div className="flex gap-1.5 p-3 bg-surface">
      <HudButton>월드</HudButton>
      <HudButton active className="text-guild">길드</HudButton>
      <HudButton disabled>월드</HudButton>
    </div>
  ),
};
