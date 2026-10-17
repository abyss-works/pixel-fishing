// 순위 표 스토리 — 내 행이 목록 안에 있을 때와 밖에 있을 때.
import type { Meta, StoryObj } from '@storybook/react';
import RankList from './RankList';

const meta: Meta<typeof RankList> = {
  title: 'UI/RankList',
  component: RankList,
  args: { valueLabel: '명성', format: (v: number) => v.toLocaleString('ko-KR') },
};

export default meta;
type Story = StoryObj<typeof RankList>;

export const MeInList: Story = {
  args: {
    rows: [
      { rank: 1, nickname: '바다사나이', value: 120_000, me: false },
      { rank: 2, nickname: '낚시왕', value: 98_000, me: true },
      { rank: 2, nickname: '붕어빵', value: 98_000, me: false },
    ],
    me: { rank: 2, value: 98_000 },
  },
};

export const MeOutside: Story = {
  args: {
    rows: [{ rank: 1, nickname: '바다사나이', value: 120_000, me: false }],
    me: { rank: 57, value: 1_200 },
  },
};
