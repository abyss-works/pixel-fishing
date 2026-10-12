// 탭바 스토리 (제어형이라 상태 래퍼).
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import TabBar from './TabBar';

const meta: Meta<typeof TabBar> = {
  title: 'UI/TabBar',
  component: TabBar,
};

export default meta;
type Story = StoryObj<typeof TabBar>;

const Demo = () => {
  const [key, setKey] = useState('bag');
  return (
    <TabBar
      tabs={[
        { key: 'region', label: '지역' },
        { key: 'bag', label: '가방' },
        { key: 'dex', label: '도감' },
      ]}
      activeKey={key}
      onSelect={setKey}
    />
  );
};

export const Default: Story = {
  render: () => <Demo />,
};
