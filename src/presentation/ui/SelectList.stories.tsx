// 선택 목록 스토리.
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import SelectList from './SelectList';

const meta: Meta<typeof SelectList> = { title: 'UI/SelectList', component: SelectList };
export default meta;
type Story = StoryObj<typeof SelectList>;

const ITEMS = ['지렁이', '반짝이 루어', '형광 루어'];

function Demo() {
  const [key, setKey] = useState(ITEMS[0]);
  return (
    <SelectList label="미끼 목록" items={ITEMS} keyOf={i => i} selectedKey={key} onSelect={setKey}
                renderItem={(i, selected) => <span className={selected ? 'text-gold' : undefined}>{i}</span>} />
  );
}

export const Default: Story = { render: () => <Demo /> };
