// 지명수배 카드 스토리 — 백엔드 없이 눈으로 확인한다.
// 상태별 3종: 미발견(실루엣) / 발견(실물) / 납품 가능.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import NamedCard from './NamedCard';
import { bountyById } from '../../../../game/content/bounties';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';

const meta: Meta<typeof NamedCard> = {
  title: 'Bounty/Named',
  component: NamedCard,
};

export default meta;
type Story = StoryObj<typeof NamedCard>;

const quest = bountyById('pacific-named-megalodon')!;
const handlers = () => ({ onAccept: fn(), onDeliver: fn(), onStartChallenge: fn() });
const game = (dex: GameState['dex']): GameState => ({ ...newState(), dex });

export const Undiscovered: Story = {
  args: {
    game: game({}), quest, canAccept: true, busy: false, progress: 0, accepted: false, ticketMins: null, ...handlers(),
  },
};

export const Discovered: Story = {
  args: {
    game: game({ megalodon: { normal: { count: 1, maxSize: null, first: null } } }),
    quest, canAccept: true, busy: false, progress: 0, accepted: false, ticketMins: null, ...handlers(),
  },
};

export const Deliverable: Story = {
  args: {
    game: game({ megalodon: { normal: { count: 1, maxSize: null, first: null } } }),
    quest, canAccept: true, busy: false, progress: 1, accepted: true, ticketMins: null, ...handlers(),
  },
};

export const Ticket: Story = {
  args: {
    game: game({}), quest, canAccept: false, busy: false, progress: 0, accepted: true, ticketMins: 42, ...handlers(),
  },
};
