// 정비 패널 4종 — 격리 검수용. dispatch는 항상 ok를 돌려주는 스텁이라 상태는 바뀌지 않는다.
import type { Meta, StoryObj } from '@storybook/react';
import FacilityModal from './FacilityModal';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import type { FishInstance } from '../../../../game/rules/logic';

const meta: Meta<typeof FacilityModal> = {
  title: 'Overlays/FacilityModal',
  component: FacilityModal,
  decorators: [Story => (
    // 스테이지 모달은 absolute라 게임 프레임 크기의 상자 안에 띄운다
    <div className="relative bg-bg" style={{ width: 896, height: 504 }}><Story /></div>
  )],
};
export default meta;
type Story = StoryObj<typeof FacilityModal>;

const inst = (uid: string, fishId: string, size = 20): FishInstance =>
  ({ uid, fishId, form: 'normal', size, caughtAt: null, spot: null, judgment: null, locked: false });
const game = (over: Partial<GameState> = {}): GameState => ({ ...newState(), gold: 12_317, fame: 61_720, rod: 4, boat: 2, ...over });
const common = {
  dispatch: () => ({ status: 'ok' as const, state: game(), result: { type: 'none' as const } }),
  setToast: () => {}, onClose: () => {},
};

export const Rod: Story = { args: { ...common, panel: 'rod', game: game() } };
export const RodShortOfGold: Story = { args: { ...common, panel: 'rod', game: game({ gold: 120, rod: 9 }) } };
export const Boat: Story = { args: { ...common, panel: 'boat', game: game({ gold: 40_000 }) } };
export const BoatShortOfFame: Story = { args: { ...common, panel: 'boat', game: game({ boat: 4, gold: 50_000, fame: 8_000 }) } };
export const BoatMax: Story = { args: { ...common, panel: 'boat', game: game({ boat: 6 }) } };
export const Sell: Story = {
  args: { ...common, panel: 'sell', game: game({ bag: [inst('a', 'crucian'), inst('b', 'carp', 31.2), inst('c', 'carp', 18.5)] }) },
};
export const Shop: Story = { args: { ...common, panel: 'shop', game: game({ items: { 'bait-common': 3 } }) } };
