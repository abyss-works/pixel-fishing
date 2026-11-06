// 줄 버튼 — 열린 창이 없는 모양과 창이 떠 있는 동안의 눌린 모양.
import type { Meta, StoryObj } from '@storybook/react';
import RowButton from './RowButton';

const meta: Meta<typeof RowButton> = {
  title: 'UI/RowButton',
  component: RowButton,
  args: { glyph: 'gear', title: '설정', onClick: () => {} },
  decorators: [Story => <div className="w-[360px]"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof RowButton>;

export const Default: Story = {};
export const Pressed: Story = { args: { pressed: true } };
