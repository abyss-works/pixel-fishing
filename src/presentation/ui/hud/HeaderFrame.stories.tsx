// 헤더 틀 스토리 - PC 레이아웃의 높이는 60px로 고정이다. 정사각형은 메뉴 버튼의 틀이다.
import type { Meta, StoryObj } from '@storybook/react';
import HeaderFrame from './HeaderFrame';

const meta: Meta<typeof HeaderFrame> = {
  title: 'Overlays/HeaderFrame',
  component: HeaderFrame,
  decorators: [Story => <div className="p-4 bg-[#0e2c4b] w-fit"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof HeaderFrame>;

export const Bar: Story = { args: { className: 'flex items-center px-4 text-sm', children: '틀' } };
export const Square: Story = { args: { as: 'button', square: true, className: 'flex items-center justify-center', 'aria-label': '정사각형 틀', children: 'M' } };
