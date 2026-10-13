// 스탯 비교표 스토리 — 변경후 유무.
import type { Meta, StoryObj } from '@storybook/react';
import StatCompare from './StatCompare';

const meta: Meta<typeof StatCompare> = {
  title: 'UI/StatCompare',
  component: StatCompare,
};

export default meta;
type Story = StoryObj<typeof StatCompare>;

export const WithNext: Story = {
  args: {
    rows: [
      { label: '낚싯대', value: 'Lv.5', next: 'Lv.6' },
      { label: '비용', value: '—', next: '1,200G' },
    ],
  },
};

export const Single: Story = {
  args: {
    rows: [{ label: '이동 속도', value: '85 (도보)' }],
  },
};
