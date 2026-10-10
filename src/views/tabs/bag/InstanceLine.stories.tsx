// 개체 줄 스토리 — 조회/선택/잠금 상태.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import InstanceLine, { UnsizedLine } from './InstanceLine';
import { FISH } from '../../../data/fish';
import type { FishInstance } from '../../../game/logic';

const meta: Meta<typeof InstanceLine> = {
  title: 'Bag/InstanceLine',
  component: InstanceLine,
};

export default meta;
type Story = StoryObj<typeof InstanceLine>;

const fish = FISH[0];
const inst: FishInstance = {
  uid: 'story-1', fishId: fish.id, form: 'normal',
  size: 12.3, caughtAt: null, spot: 'pond', judgment: 'normal', locked: false,
};

export const View: Story = {
  args: { inst, fish },
};

export const Locked: Story = {
  args: { inst: { ...inst, locked: true }, fish, onLock: fn() },
};

export const Selectable: Story = {
  args: { inst, fish, checked: true, best: true, onToggle: fn(), onLock: fn() },
};

export const Unsized: StoryObj<typeof UnsizedLine> = {
  render: () => <UnsizedLine count={3} form="normal" locked={false} onLock={fn()} />,
};
