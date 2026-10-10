// 수량 스테퍼 스토리 — inline/side 변형 (제어형이라 상태 래퍼).
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import NumberStepper from './NumberStepper';

const meta: Meta<typeof NumberStepper> = {
  title: 'UI/NumberStepper',
  component: NumberStepper,
};

export default meta;
type Story = StoryObj<typeof NumberStepper>;

const InlineDemo = () => {
  const [v, setV] = useState(1);
  return <NumberStepper value={v} onChange={setV} ariaLabel="미끼" />;
};

const SideDemo = () => {
  const [v, setV] = useState(3);
  return <NumberStepper value={v} onChange={setV} variant="side" max={10} ariaLabel="미끼" />;
};

export const Inline: Story = {
  render: () => <InlineDemo />,
};

export const Side: Story = {
  render: () => <SideDemo />,
};
