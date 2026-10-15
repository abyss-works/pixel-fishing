// 스테이지 모달 카드 — 제목·본문·확정 영역·닫기 골격.
import type { Meta, StoryObj } from '@storybook/react';
import ModalCard from './ModalCard';
import Button from './Button';
import CostLine from './CostLine';
import Note from './Note';
import StatCompare from './StatCompare';

const meta: Meta<typeof ModalCard> = { title: 'UI/ModalCard', component: ModalCard };
export default meta;
type Story = StoryObj<typeof ModalCard>;

export const Plain: Story = {
  args: { title: '조선소', onClose: () => {}, children: <Note>이미 최고의 배다.</Note> },
};

export const WithFooter: Story = {
  args: {
    title: '낚싯대 강화 — Lv.3 → Lv.4',
    onClose: () => {},
    children: <StatCompare rows={[{ label: '입질 대기', value: '3.0~6.0s', next: '2.8~5.6s' }]} />,
    footer: (
      <>
        <CostLine have={1200} delta={-800} />
        <Button variant="primary" full>강화하기 (-800G)</Button>
      </>
    ),
  },
};
