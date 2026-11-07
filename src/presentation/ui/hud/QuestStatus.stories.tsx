// 의뢰 현황 스토리 — 보통 값, 가장 긴 값, 모두 마친 값.
import type { Meta, StoryObj } from '@storybook/react';
import QuestStatus from './QuestStatus';

const meta: Meta<typeof QuestStatus> = {
  title: 'Overlays/QuestStatus',
  component: QuestStatus,
  decorators: [Story => <div className="relative p-4 bg-[#0e2c4b] w-fit"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof QuestStatus>;

export const Typical: Story = { args: { general: 1, named: 1, generalCap: 1, namedCap: 1 } };
export const Longest: Story = { args: { general: 10, named: 3, generalCap: 10, namedCap: 3 } };
export const Done: Story = { args: { general: 0, named: 0, generalCap: 1, namedCap: 1 } };
