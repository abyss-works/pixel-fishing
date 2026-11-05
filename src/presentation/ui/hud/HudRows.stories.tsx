// HUD 수치 목록 스토리 — 방치 결과 카드의 수치 줄.
import type { Meta, StoryObj } from '@storybook/react';
import HudRows from './HudRows';

const meta: Meta<typeof HudRows> = {
  title: 'Overlays/HudRows',
  component: HudRows,
  decorators: [Story => <div className="w-[272px] p-3 bg-surface"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof HudRows>;

export const Away: Story = {
  args: {
    rows: [
      { key: 'catches', label: '잡은 물고기', value: '412' },
      { key: 'fame', label: '명성', value: '+1,240' },
      { key: 'dex', label: '새 도감', value: '2' },
    ],
  },
};
