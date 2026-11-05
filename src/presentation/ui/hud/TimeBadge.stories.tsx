// 시간 배지 — 해/달과 게임 시계. 시각은 시간 고정으로 정한다.
import type { Meta, StoryObj } from '@storybook/react';
import { setTimeOverride } from '../../../features/gameplay/service/timeOverride';
import { clockAt } from '../../layouts/hud/hudStoryFixtures';
import TimeBadge from './TimeBadge';

const meta: Meta<typeof TimeBadge> = {
  title: 'Stage/TimeBadge',
  component: TimeBadge,
  parameters: { layout: 'fullscreen', stage: {} },
  args: { className: 'top-5 right-[58px]' },
};
export default meta;
type Story = StoryObj<typeof TimeBadge>;

export const Day: Story = {
  beforeEach: () => { setTimeOverride(clockAt(30)); return () => setTimeOverride(null); },
};

export const Night: Story = {
  beforeEach: () => { setTimeOverride(clockAt(57)); return () => setTimeOverride(null); },
};
