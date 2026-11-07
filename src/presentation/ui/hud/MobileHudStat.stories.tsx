// HUD 값 칸 스토리 - 아이콘 칸, 색 표지 칸, 톤. 이름은 화면 글자가 아니라 sr-only다. 값 글자는 스테이지 폭에 따라 12, 13px다(모바일 배치 전용). 도형 표지는 모양이 달라 색만으로 구분하지 않는다.
import type { Meta, StoryObj } from '@storybook/react';
import MobileHudStat from './MobileHudStat';

const meta: Meta<typeof MobileHudStat> = {
  title: 'Overlays/MobileHudStat',
  component: MobileHudStat,
  decorators: [Story => <div className="w-fit bg-[#0e2c4b] p-4"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof MobileHudStat>;

export const WithIcon: Story = {
  render: () => <MobileHudStat glyph="coin" label="골드"><b className="font-bold">12.4K</b></MobileHudStat>,
};

export const WithMarker: Story = {
  render: () => <MobileHudStat label="일반"><b className="font-bold">1</b></MobileHudStat>,
};

export const WithDiamond: Story = {
  render: () => <MobileHudStat label="네임드" tone="epic" marker="diamond"><b className="font-bold">3</b></MobileHudStat>,
};

export const Tones: Story = {
  render: () => (
    <div className="flex gap-6">
      <MobileHudStat label="골드"><b className="font-bold">1</b></MobileHudStat>
      <MobileHudStat label="주황" tone="orange"><b className="font-bold">2</b></MobileHudStat>
      <MobileHudStat label="위험" tone="danger"><b className="font-bold">3</b></MobileHudStat>
      <MobileHudStat label="네임드" tone="epic"><b className="font-bold">4</b></MobileHudStat>
    </div>
  ),
};
