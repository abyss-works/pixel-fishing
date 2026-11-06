// 칸 버튼 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import SlotCell from './SlotCell';

const meta: Meta<typeof SlotCell> = {
  title: 'UI/SlotCell',
  component: SlotCell,
  args: { ariaLabel: '칸', onSelect: () => {}, className: 'w-24 h-16 flex items-center justify-center', children: '칸' },
};
export default meta;
type Story = StoryObj<typeof SlotCell>;

export const Raised: Story = { args: { form: 'raised' } };
export const Sunken: Story = { args: { form: 'sunken' } };
export const Pressed: Story = { args: { form: 'pressed' } };
export const Picked: Story = { args: { form: 'raised', picked: true } };
