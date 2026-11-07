// HUD 값 칸 스토리 — 아이콘이 있는 칸, 아이콘이 없는 칸, 톤.
import type { Meta, StoryObj } from '@storybook/react';
import HudStat from './HudStat';

const meta: Meta<typeof HudStat> = { title: 'Overlays/HudStat', component: HudStat };
export default meta;
type Story = StoryObj<typeof HudStat>;

export const WithIcon: Story = {
  render: () => <HudStat glyph="coin" label="골드"><b className="font-bold">12.4K</b></HudStat>,
};

export const LabelOnly: Story = {
  render: () => <HudStat label="일반"><b className="font-bold">1</b></HudStat>,
};

export const Tones: Story = {
  render: () => (
    <div className="flex gap-6 p-4 bg-bg">
      <HudStat label="골드"><b className="font-bold">1</b></HudStat>
      <HudStat label="주황" tone="orange"><b className="font-bold">2</b></HudStat>
      <HudStat label="위험" tone="danger"><b className="font-bold">3</b></HudStat>
      <HudStat label="네임드" tone="epic"><b className="font-bold">4</b></HudStat>
    </div>
  ),
};
