// 자원 바 — 스테이지 위 가운데. 오늘 의뢰 칸은 수배판 응답(MSW)으로 채운다.
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { bountyHandler } from '../../layouts/hud/hudStoryFixtures';
import ResourceBar from './ResourceBar';

const bag = (n: number): GameState['bag'] => Array.from({ length: n }, (_, i) => ({
  uid: `f${i}`, fishId: 'mackerel', form: 'normal', size: 30, caughtAt: null, spot: null, judgment: null, locked: false,
}));
const game = (over: Partial<GameState> = {}): GameState =>
  ({ ...newState(), gold: 12_417, fame: 4_210, boat: 2, rod: 12, bag: bag(45), ...over });

const meta: Meta<typeof ResourceBar> = {
  title: 'Stage/ResourceBar',
  component: ResourceBar,
  parameters: { layout: 'fullscreen', stage: {}, msw: [bountyHandler({ clears: [{ kind: 'general' }] })] },
  args: { game: game(), onOpen: () => {} },
};
export default meta;
type Story = StoryObj<typeof ResourceBar>;

export const Default: Story = {};

/** 수배판 값을 아직 못 받았다 — 오늘 의뢰 칸이 0을 보인다 */
export const Unknown: Story = {
  parameters: { msw: [http.get('/api/me', () => HttpResponse.json({}, { status: 500 }))] },
};

/** 가방이 거의 찼다 — 가방 칸이 빨강 계열 */
export const BagFull: Story = { args: { game: game({ bag: bag(290), gold: 1_284_000, fame: 912_400 }) } };
