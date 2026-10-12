// 안내문 스토리 — info/warn 톤.
import type { Meta, StoryObj } from '@storybook/react';
import Note from './Note';

const meta: Meta<typeof Note> = {
  title: 'UI/Note',
  component: Note,
};

export default meta;
type Story = StoryObj<typeof Note>;

export const Info: Story = {
  args: { children: '가방이 비어 있다. 물고기 군집을 찾아 낚시하자.' },
};

export const Warn: Story = {
  args: { tone: 'warn', children: '네트워크가 끊기면 낚시를 할 수 없다.' },
};
