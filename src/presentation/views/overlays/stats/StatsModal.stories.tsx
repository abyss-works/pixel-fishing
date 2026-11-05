// 스탯창 — 탭 넷(요약, 배, 낚싯대, 보너스)과 보너스가 없는 경우. 게임 상태만 받아 그린다.
import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within } from 'storybook/test';
import { newState } from '../../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../../game/rules/logic';
import StatsModal from './StatsModal';

const meta: Meta<typeof StatsModal> = {
  title: 'Stage/StatsModal',
  component: StatsModal,
  parameters: { layout: 'fullscreen', stage: {} },
};
export default meta;
type Story = StoryObj<typeof StatsModal>;

const inst = (uid: string, fishId: string, size: number): FishInstance =>
  ({ uid, fishId, form: 'normal', size, caughtAt: null, spot: null, judgment: null, locked: false });
const game = (over: Partial<GameState> = {}): GameState => ({
  ...newState(), gold: 48_210, fame: 18_400, rod: 9, boat: 3,
  location: { kind: 'region', id: 'world' },
  bag: [inst('a', 'mackerel', 34.2), inst('b', 'tuna', 182.5), inst('c', 'squid', 41.0), inst('d', 'seabream', 38.7)],
  artifacts: ['abyss-angler', 'wreck-compass'],
  items: { 'bait-rare': 12 }, activeBait: 'bait-rare',
  ...over,
});
const GUILD = { level: 3, effects: { sell: 0.04, bag: 0.12, named: 0.05, rare: 0, mutation: 0 } };
const args = { game: game(), movement: 'sail' as const, region: 'world' as const, nickname: '바다의별', guild: GUILD, onClose: () => {} };
const openTab = (name: string): Story['play'] => async ({ canvasElement }) => {
  await userEvent.click(await within(canvasElement).findByRole('button', { name }));
  // 캡처에 클릭 포커스 테두리가 남지 않게 한다
  (document.activeElement as HTMLElement | null)?.blur();
};

export const Summary: Story = { args };
export const Boat: Story = { args, play: openTab('배') };
export const Rod: Story = { args, play: openTab('낚싯대') };
export const Bonus: Story = { args, play: openTab('보너스') };
/** 유물, 미끼, 길드가 없어 보너스가 하나도 없다 */
export const BonusEmpty: Story = {
  args: { ...args, game: game({ artifacts: [], activeBait: null, items: {} }), guild: null },
  play: openTab('보너스'),
};
/** 처음 시작한 상태: 배가 없고 마을에 있다 */
export const Beginner: Story = {
  args: { ...args, game: { ...newState(), gold: 120, fame: 40 }, movement: 'walk', region: 'village', nickname: null, guild: null },
};
