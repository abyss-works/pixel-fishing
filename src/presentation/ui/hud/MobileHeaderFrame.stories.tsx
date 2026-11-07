// 모바일 헤더 틀 스토리 - 모바일 레이아웃의 높이는 40px로 고정이다. 정사각형은 메뉴 버튼의 틀이다.
import type { Meta, StoryObj } from '@storybook/react';
import MobileHeaderFrame from './MobileHeaderFrame';

const meta: Meta<typeof MobileHeaderFrame> = {
  title: 'Overlays/MobileHeaderFrame',
  component: MobileHeaderFrame,
  decorators: [Story => <div className="p-4 bg-[#0e2c4b] w-fit"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof MobileHeaderFrame>;

export const Bar: Story = { args: { className: 'flex items-center px-4 text-sm', children: '틀' } };
export const Square: Story = { args: { as: 'button', square: true, className: 'flex items-center justify-center', 'aria-label': '정사각형 틀', children: 'M' } };
