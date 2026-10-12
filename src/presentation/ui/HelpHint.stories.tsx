// 호버 도움말 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import HelpHint from './HelpHint';

const meta: Meta<typeof HelpHint> = {
  title: 'UI/HelpHint',
  component: HelpHint,
};

export default meta;
type Story = StoryObj<typeof HelpHint>;

export const Default: Story = {
  render: () => (
    <span className="text-sm">
      낚싯대 파워
      <HelpHint text="방치로 낚을 때는 희귀한 어종이 잘 걸리지 않는다." />
    </span>
  ),
};
