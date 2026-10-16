// 상세 머리 스토리 — 큰 그림 + 이름 + 꼬리표.
import type { Meta, StoryObj } from '@storybook/react';
import HeroHeader from './HeroHeader';
import ColorSwatch from './ColorSwatch';

const meta: Meta<typeof HeroHeader> = { title: 'UI/HeroHeader', component: HeroHeader };
export default meta;
type Story = StoryObj<typeof HeroHeader>;

export const Default: Story = {
  args: { sprite: <ColorSwatch color="#42a5f5" big />, title: '반짝이 루어', tags: ['희귀 미끼', '보유 3개'] },
};
