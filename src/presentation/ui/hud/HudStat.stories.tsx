// HUD 값 칸 스토리 - 아이콘 칸, 색 표지 칸, 톤. 이름은 화면 글자가 아니라 sr-only다. 값 글자는 스테이지 폭에 따라 11, 12, 14px다.
import type { Meta, StoryObj } from '@storybook/react';
import HudStat from './HudStat';

const meta: Meta<typeof HudStat> = {
  title: 'Overlays/HudStat',
  component: HudStat,
  decorators: [Story => <div className="w-fit bg-[#0e2c4b] p-4"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof HudStat>;

export const WithIcon: Story = {
  render: () => <HudStat glyph="coin" label="골드"><b className="font-bold">12.4K</b></HudStat>,
};

export const WithMarker: Story = {
  render: () => <HudStat label="일반"><b className="font-bold">1</b></HudStat>,
};

export const Tones: Story = {
  render: () => (
    <div className="flex gap-6">
      <HudStat label="골드"><b className="font-bold">1</b></HudStat>
      <HudStat label="주황" tone="orange"><b className="font-bold">2</b></HudStat>
      <HudStat label="위험" tone="danger"><b className="font-bold">3</b></HudStat>
      <HudStat label="네임드" tone="epic"><b className="font-bold">4</b></HudStat>
    </div>
  ),
};
