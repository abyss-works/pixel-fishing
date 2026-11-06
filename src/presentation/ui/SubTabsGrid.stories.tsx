// 같은 폭 서브탭 스토리 (제어형이라 상태 래퍼). 칸은 줄을 같은 폭으로 나눠 채우고, 넘치면 다음 줄로 넘긴다.
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import SubTabsGrid from './SubTabsGrid';

const meta: Meta<typeof SubTabsGrid> = {
  title: 'UI/SubTabsGrid',
  component: SubTabsGrid,
};

export default meta;
type Story = StoryObj<typeof SubTabsGrid>;

type Item = { key: string; label: string; sub?: string };

const Demo = ({ items, width }: { items: Item[]; width: number }) => {
  const [key, setKey] = useState(items[0].key);
  return (
    <div className="bg-surface p-2" style={{ width }}>
      <SubTabsGrid items={items} activeKey={key} onSelect={setKey} />
    </div>
  );
};

const FOUR: Item[] = [
  { key: 'a', label: '물고기' }, { key: 'b', label: '아이템' },
  { key: 'c', label: '유물' }, { key: 'd', label: '카드' },
];

const ZONES: Item[] = [
  { key: 'village', label: '마을', sub: '3/8' }, { key: 'pacific', label: '태평양', sub: '12/20' },
  { key: 'trench', label: '해구', sub: '0/9' }, { key: 'sea', label: '동남아', sub: '5/14' },
  { key: 'dragon', label: '드래곤 홀', sub: '1/7' }, { key: 'madagascar', label: '마다가스카르', sub: '2/11' },
  { key: 'comoros', label: '코모로', sub: '0/6' },
];

export const FourItems: Story = {
  render: () => <Demo items={FOUR} width={360} />,
};

export const Wrapped: Story = {
  render: () => <Demo items={ZONES.map(({ key, label }) => ({ key, label }))} width={360} />,
};

export const WithSubLine: Story = {
  render: () => <Demo items={ZONES} width={360} />,
};

export const Default: Story = {
  render: () => <Demo items={ZONES.slice(0, 2)} width={360} />,
};
