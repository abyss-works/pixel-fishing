// 진행 사다리 — 지나온 것·현재·다음·잠김 네 상태.
import type { Meta, StoryObj } from '@storybook/react';
import ProgressLadder from './ProgressLadder';
import BoatSprite from './BoatSprite';
import PixelIcon from './PixelIcon';

const meta: Meta<typeof ProgressLadder> = { title: 'UI/ProgressLadder', component: ProgressLadder };
export default meta;
type Story = StoryObj<typeof ProgressLadder>;

export const Boats: Story = {
  args: {
    label: '배 목록',
    steps: [
      { key: '1', label: '조각배', subs: ['속도 85', '가방 140'], state: 'done', leading: <BoatSprite tier={1} preset="thumb" />,
        trailing: <PixelIcon glyph="check" size={12} /> },
      { key: '2', label: '돛단배', subs: ['속도 100', '가방 300'], state: 'current', leading: <BoatSprite tier={2} preset="thumb" />,
        trailing: <span className="text-accent">타는 중</span> },
      { key: '3', label: '정크선', subs: ['속도 115', '가방 500'], state: 'next', leading: <BoatSprite tier={3} preset="thumb" />,
        trailing: <span className="pf-accent">6,000G</span> },
      { key: '4', label: '범선', subs: ['속도 130', '가방 1,000'], state: 'locked', leading: <BoatSprite tier={4} preset="thumb" />,
        trailing: <><PixelIcon glyph="lock" size={12} /><span className="pf-accent">명성 11,000</span></> },
    ],
  },
};

export const Rod: Story = {
  args: {
    label: '낚싯대 단계',
    steps: [
      { key: '3', label: 'Lv.3', subs: ['입질 3.5~7.1초', '파워 130'], state: 'done', trailing: <PixelIcon glyph="check" size={12} /> },
      { key: '4', label: 'Lv.4', subs: ['입질 3.3~6.6초', '파워 145'], state: 'current', trailing: <span className="text-accent">지금</span> },
      { key: '5', label: 'Lv.5', subs: ['입질 3.1~6.2초', '파워 160'], state: 'next', trailing: <span className="pf-accent">418G</span> },
      { key: '6', label: 'Lv.6', subs: ['입질 2.9~5.8초', '파워 175'], state: 'locked', trailing: <span className="pf-accent">1,000G</span> },
    ],
  },
};
