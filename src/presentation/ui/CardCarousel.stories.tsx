// 카드 캐러셀 스토리 — 넘칠 때만 화살표.
import type { Meta, StoryObj } from '@storybook/react';
import CardCarousel from './CardCarousel';

const meta: Meta<typeof CardCarousel> = {
  title: 'UI/CardCarousel',
  component: CardCarousel,
};

export default meta;
type Story = StoryObj<typeof CardCarousel>;

const cards = (n: number) =>
  Array.from({ length: n }, (_, i) => (
    <div key={i} className="border border-line rounded-sm p-2 text-sm basis-(--card-w)">
      카드 {i + 1}
    </div>
  ));

export const Fit: Story = {
  render: () => <CardCarousel perView={3}>{cards(2)}</CardCarousel>,
};

export const Overflow: Story = {
  render: () => <CardCarousel perView={3}>{cards(8)}</CardCarousel>,
};
