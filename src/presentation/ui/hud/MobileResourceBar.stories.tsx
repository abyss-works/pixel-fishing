// 모바일 자원 바 스토리 - 골드, 명성, 가방 세 칸. 모바일 레이아웃(뷰포트 폭 1024px 미만) 전용이다. 스테이지 폭 380 미만 12px, 이상 13px, 440 미만에서 가방 비율 생략.
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { newState } from '../../../game/rules/logic';
import type { FishInstance } from '../../../game/rules/logic';
import MobileResourceBar from './MobileResourceBar';

const fish = (i: number): FishInstance => ({ uid: `u${i}`, fishId: 'carp', form: 'normal', size: 10,
  caughtAt: null, spot: null, judgment: null, locked: false });

const meta: Meta<typeof MobileResourceBar> = {
  title: 'Overlays/MobileResourceBar',
  component: MobileResourceBar,
  decorators: [Story => <div className="grid w-[360px] grid-cols-[minmax(0,1fr)] bg-[#0e2c4b] p-1 [container-type:inline-size]"><Story /></div>],
  args: { onOpen: fn() },
};
export default meta;
type Story = StoryObj<typeof MobileResourceBar>;

export const Typical: Story = {
  args: { game: { ...newState(), boat: 3, gold: 12_400, fame: 3_200, bag: Array.from({ length: 84 }, (_, i) => fish(i)) } },
};

/** 가장 긴 값: 골드 99.9K, 명성 1.99M, 가방 2990 */
export const Longest: Story = {
  args: { game: { ...newState(), boat: 3, gold: 99_999, fame: 1_999_999, bag: Array.from({ length: 2990 }, (_, i) => fish(i)) }, bagBonus: 5 },
};
