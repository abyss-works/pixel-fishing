// 섹션 제목 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import SectionTitle from './SectionTitle';

const meta: Meta<typeof SectionTitle> = {
  title: 'UI/SectionTitle',
  component: SectionTitle,
};

export default meta;
type Story = StoryObj<typeof SectionTitle>;

export const Default: Story = {
  args: { children: '시간대 설정' },
};
