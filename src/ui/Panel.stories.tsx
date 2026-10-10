// 패널 스토리 — 제목 유무.
import type { Meta, StoryObj } from '@storybook/react';
import Panel from './Panel';

const meta: Meta<typeof Panel> = {
  title: 'UI/Panel',
  component: Panel,
};

export default meta;
type Story = StoryObj<typeof Panel>;

export const Titled: Story = {
  args: { title: '스탯', children: '값은 전부 스탯 서비스에서 온다.' },
};

export const Untitled: Story = {
  args: { children: '제목 없는 박스형 콘텐츠.' },
};
