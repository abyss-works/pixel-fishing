// 서브탭 스토리 (제어형이라 상태 래퍼).
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import SubTabs from './SubTabs';

const meta: Meta<typeof SubTabs> = {
  title: 'UI/SubTabs',
  component: SubTabs,
};

export default meta;
type Story = StoryObj<typeof SubTabs>;

const Demo = () => {
  const [key, setKey] = useState('fish');
  return (
    <SubTabs
      items={[
        { key: 'fish', label: '물고기 12' },
        { key: 'items', label: '아이템 3' },
      ]}
      activeKey={key}
      onSelect={setKey}
    />
  );
};

export const Default: Story = {
  render: () => <Demo />,
};
