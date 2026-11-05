// 메뉴 목록 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import MenuList from './MenuList';

const meta: Meta<typeof MenuList> = { title: 'UI/MenuList', component: MenuList };
export default meta;
type Story = StoryObj<typeof MenuList>;

export const Default: Story = {
  args: {
    className: 'min-w-[150px] p-1',
    items: ['길드', '소셜', '우편함'].map(label => ({
      key: label, label, onSelect: fn(), content: <span className="h-9 px-2 flex items-center text-sm">{label}</span>,
    })),
  },
};
