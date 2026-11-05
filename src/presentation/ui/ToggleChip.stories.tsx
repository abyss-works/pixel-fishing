// 토글 칩 스토리 — 강조 세 단계(완전 강조, 일반 켜짐, 꺼짐)와 쓸 수 없는 상태.
import type { Meta, StoryObj } from '@storybook/react';
import ToggleChip from './ToggleChip';

const meta: Meta<typeof ToggleChip> = { title: 'UI/ToggleChip', component: ToggleChip };
export default meta;
type Story = StoryObj<typeof ToggleChip>;

export const Tiers: Story = {
  render: () => (
    <div className="flex gap-1.5 p-3 bg-surface">
      <ToggleChip pressed emphasis>완전 강조</ToggleChip>
      <ToggleChip pressed>일반 켜짐</ToggleChip>
      <ToggleChip pressed={false}>꺼짐</ToggleChip>
      <ToggleChip pressed={false} disabled>쓸 수 없음</ToggleChip>
    </div>
  ),
};

/** 꺼 둔 채널에 새 글이 온 표시 — 이름 뒤의 네모 골드 점 */
export const WithDot: Story = {
  render: () => (
    <div className="flex gap-1.5 p-3 bg-surface">
      <ToggleChip pressed>채팅</ToggleChip>
      <ToggleChip pressed={false}>길드<span className="size-1.5 bg-gold" aria-hidden="true" /></ToggleChip>
      <ToggleChip pressed>시스템</ToggleChip>
    </div>
  ),
};
