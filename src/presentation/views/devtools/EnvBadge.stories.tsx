// 환경 배지 — 비운영 빌드에서 스테이지 아래 가운데에 깜빡인다.
import type { Meta, StoryObj } from '@storybook/react';
import { DevEnvContext, devEnvOf } from './devEnv';
import EnvBadge from './EnvBadge';

const meta: Meta<typeof EnvBadge> = {
  title: 'Stage/EnvBadge',
  component: EnvBadge,
  parameters: { layout: 'fullscreen', stage: {} },
  args: { build: 'v0.15.4-a1b2c3d' },
};
export default meta;
type Story = StoryObj<typeof EnvBadge>;

export const Preview: Story = {
  decorators: [Story => <DevEnvContext.Provider value={devEnvOf('preview')}><Story /></DevEnvContext.Provider>],
};

export const Local: Story = {
  decorators: [Story => <DevEnvContext.Provider value={devEnvOf('local')}><Story /></DevEnvContext.Provider>],
};
