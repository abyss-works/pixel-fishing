// 의뢰 창 스토리 - 일반 의뢰 진행 중, 네임드 토벌 진행 중(흔적 남음), 받은 의뢰 없음, 읽는 중.
// 창 크기는 스토리가 뜬 화면 크기가 정한다. 확인 크기: 모바일 360x640, 390x844, PC 1024x600, 1920x1080.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { selectQuestInfo } from '../../../../features/bounty/model/questInfo';
import type { BountySnapshot } from '../../../../features/bounty/model/types';
import { bountyById } from '../../../../game/content/bounties';
import { newState } from '../../../../game/rules/logic';
import GameStageLayout from '../../../layouts/game-stage/GameStageLayout';
import QuestInfoWindow from './QuestInfoWindow';

const general = bountyById('pacific-easy-common')!;
const named = bountyById('pacific-named-megalodon')!;
const NOW = Date.parse('2026-10-13T00:01:00.000Z');
const snapshot = (over: Partial<BountySnapshot> = {}): BountySnapshot => ({
  clearsToday: { general: 0, named: 0 }, progress: [], tickets: [], ...over,
});
const infoOf = (snap: BountySnapshot | null, game = newState()) =>
  ({ ...selectQuestInfo({ game, snapshot: snap, nowMs: NOW }), status: snap ? 'ready' as const : 'loading' as const });

const meta: Meta<typeof QuestInfoWindow> = {
  title: 'Bounty/QuestInfoWindow',
  component: QuestInfoWindow,
  parameters: { layout: 'fullscreen' },
  decorators: [Story => (
    <div className="fixed inset-0 flex flex-col bg-bg">
      <GameStageLayout>
        <div className="absolute inset-0 bg-[#0e2c4b]" />
        <Story />
      </GameStageLayout>
    </div>
  )],
  args: { onClose: fn() },
};
export default meta;
type Story = StoryObj<typeof QuestInfoWindow>;

export const GeneralInProgress: Story = {
  args: { info: infoOf(snapshot({ progress: [{ questId: general.id, progress: 83 }, { questId: named.id, progress: 0 }] })) },
};

/** 네임드 토벌 탭. 도전권이 유효해 흔적 남은 시간이 보인다 */
export const NamedInProgress: Story = {
  args: {
    initialTab: 'named',
    info: infoOf(snapshot({
      clearsToday: { general: 1, named: 0 },
      progress: [{ questId: named.id, progress: 0 }],
      tickets: [{ questId: named.id, issuedAt: '2026-10-13T00:00:00.000Z' }],
    })),
  },
};

export const NoQuests: Story = { args: { info: infoOf(snapshot()) } };
export const Loading: Story = { args: { info: infoOf(null) } };
