// 제목 3단 — 화면 제목(PageTitle) · 섹션(SectionTitle) · 소제목(Subheading)을 한 화면에.
import type { Meta, StoryObj } from '@storybook/react';
import PageTitle from './PageTitle';
import SectionTitle from './SectionTitle';
import Subheading from './Subheading';

const meta: Meta<typeof PageTitle> = { title: 'UI/Titles', component: PageTitle };
export default meta;
type Story = StoryObj<typeof PageTitle>;

export const Hierarchy: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <PageTitle>물고기 (12/140마리)</PageTitle>
      <SectionTitle>등급 분포 — 태평양</SectionTitle>
      <Subheading>미끼</Subheading>
    </div>
  ),
};
