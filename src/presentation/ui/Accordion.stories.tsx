// 아코디언 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import Accordion from './Accordion';

const meta: Meta<typeof Accordion> = {
  title: 'UI/Accordion',
  component: Accordion,
};

export default meta;
type Story = StoryObj<typeof Accordion>;

export const Default: Story = {
  render: () => (
    <Accordion summary="v0.9.0 패치노트">
      <p className="text-sm text-text-dim p-2">닉네임과 설정을 개편했어요.</p>
    </Accordion>
  ),
};
