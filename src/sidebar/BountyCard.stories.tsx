// 수배서 카드 스토리 — 백엔드 없이 눈으로 확인한다.
// 상태별 4종: 쉬움 / 어려움 / 진행 중 / 납품 가능.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import BountyCard from './BountyCard';
import { bountyById } from '../data/bounties';

const meta: Meta<typeof BountyCard> = {
  title: 'Bounty/Card',
  component: BountyCard,
};

export default meta;
type Story = StoryObj<typeof BountyCard>;

const quest = (id: string) => bountyById(id)!;
const handlers = () => ({ onAccept: fn(), onDeliver: fn() });

export const Easy: Story = {
  args: {
    quest: quest('pacific-easy-common'), progress: 0,
    canAccept: true, busy: false, ...handlers(),
  },
};

export const Hard: Story = {
  args: {
    quest: quest('pacific-hard-legendary'), progress: 0,
    canAccept: true, busy: false, ...handlers(),
  },
};

export const InProgress: Story = {
  args: {
    quest: quest('pacific-normal-rare'), progress: 7,
    canAccept: true, busy: false, ...handlers(),
  },
};

export const Deliverable: Story = {
  args: {
    quest: quest('pacific-easy-common'), progress: 250,
    canAccept: true, busy: false, ...handlers(),
  },
};
