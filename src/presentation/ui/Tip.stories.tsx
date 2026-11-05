// 툴팁 스토리: 마우스를 올리거나 키보드로 포커스하면 설명이 뜬다.
import type { Meta, StoryObj } from '@storybook/react';
import Tip from './Tip';

const meta: Meta<typeof Tip> = {
  title: 'UI/Tip',
  component: Tip,
};

export default meta;
type Story = StoryObj<typeof Tip>;

export const Text: Story = {
  render: () => <Tip text="한국 시간 새벽 4시에 새로 세요.">오늘 기여</Tip>,
};

export const Meter: Story = {
  render: () => (
    <div className="w-60">
      <Tip plain text="길드원이 얻은 명성만큼 기여가 쌓여요." className="block">
        <span className="block h-2 border border-line bg-bg"><span className="block h-full w-3/5 bg-accent" /></span>
      </Tip>
    </div>
  ),
};
