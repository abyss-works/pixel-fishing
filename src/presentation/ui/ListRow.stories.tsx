// 목록 행 — 다섯 상태(지난 것, 지금, 고름, 잠김, 고를 수 있음).
import type { Meta, StoryObj } from '@storybook/react';
import ListRow from './ListRow';
import Inset from './Inset';
import PixelIcon from './PixelIcon';

const meta: Meta<typeof ListRow> = { title: 'UI/ListRow', component: ListRow };
export default meta;
type Story = StoryObj<typeof ListRow>;

export const States: Story = {
  render: () => (
    <Inset className="p-2 flex flex-col gap-1.5 w-[430px]">
      <ListRow state="done" name="Lv.10" subs={['입질 4.6~9.8초', '파워 300']} trailing={<PixelIcon glyph="checkOn" size={12} />} />
      <ListRow state="current" name="Lv.11" subs={['입질 4.4~9.4초', '파워 315']} trailing={<span className="text-accent">지금</span>} />
      <ListRow state="selected" name="Lv.12" subs={['입질 4.2~9.0초', '파워 330']} trailing={<span className="pf-accent">2,600G</span>} />
      <ListRow state="locked" name="Lv.13" subs={['입질 4.0~8.6초', '파워 345']} trailing={<span className="pf-accent">3,000G</span>} />
    </Inset>
  ),
};

export const Selectable: Story = {
  args: { state: 'open', name: '희귀 미끼', subs: ['희귀', '보유 3'], trailing: <span className="pf-accent">200G</span>, onSelect: () => {} },
};
