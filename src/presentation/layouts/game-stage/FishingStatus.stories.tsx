// 낚시 상태 띠 — 게임 프레임 아래 가운데.
import type { Meta, StoryObj } from '@storybook/react';
import FishingStatus from './FishingStatus';

const meta: Meta<typeof FishingStatus> = {
  title: 'Stage/FishingStatus',
  component: FishingStatus,
  parameters: { layout: 'fullscreen', stage: { frame: true } },
};
export default meta;
type Story = StoryObj<typeof FishingStatus>;

/** 입질을 기다리는 중 — 두 줄 안내 */
export const Wait: Story = { args: { phase: 'wait' } };

/** 입질 — 한 줄 안내 */
export const Bite: Story = { args: { phase: 'bite' } };
