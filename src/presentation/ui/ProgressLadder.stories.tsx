// 진행 사다리 — 지나온 것·현재·다음·잠김 네 상태.
import type { Meta, StoryObj } from '@storybook/react';
import ProgressLadder from './ProgressLadder';
import BoatSprite from './BoatSprite';

const meta: Meta<typeof ProgressLadder> = { title: 'UI/ProgressLadder', component: ProgressLadder };
export default meta;
type Story = StoryObj<typeof ProgressLadder>;

export const Boats: Story = {
  args: {
    steps: [
      { key: '1', label: '조각배', meta: '속도 85 · 가방 140', state: 'done', leading: <BoatSprite tier={1} preset="thumb" /> },
      { key: '2', label: '돛단배', meta: '속도 100 · 가방 300', state: 'current', leading: <BoatSprite tier={2} preset="thumb" /> },
      { key: '3', label: '정크선', meta: '속도 115 · 가방 500 · 명성 3,500', state: 'next', leading: <BoatSprite tier={3} preset="thumb" /> },
      { key: '4', label: '범선', meta: '명성 11,000', state: 'locked', leading: <BoatSprite tier={4} preset="thumb" /> },
    ],
  },
};

export const Rod: Story = {
  args: {
    steps: [
      { key: '3', label: 'Lv.3', meta: '입질 3.5~7.1s', state: 'done' },
      { key: '4', label: 'Lv.4', meta: '입질 3.3~6.6s', state: 'current' },
      { key: '5', label: 'Lv.5', meta: '입질 3.1~6.2s · 418G', state: 'next' },
      { key: '6', label: 'Lv.6', meta: '1,000G', state: 'locked' },
    ],
  },
};
