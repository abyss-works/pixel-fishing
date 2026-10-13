// 유물 카드 스토리 — 교환 가능/재료 부족/보유 중.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import RelicCard from './RelicCard';
import { ARTIFACTS } from '../../../../game/content/artifacts';

const meta: Meta<typeof RelicCard> = {
  title: 'Bounty/RelicCard',
  component: RelicCard,
  args: { onExchange: fn() },
};

export default meta;
type Story = StoryObj<typeof RelicCard>;

const artifact = ARTIFACTS[0];

export const Exchangeable: Story = {
  args: { artifact, owned: false, materialCount: 1, busy: false },
};

export const NoMaterial: Story = {
  args: { artifact, owned: false, materialCount: 0, busy: false },
};

export const Owned: Story = {
  args: { artifact, owned: true, materialCount: 1, busy: false },
};
