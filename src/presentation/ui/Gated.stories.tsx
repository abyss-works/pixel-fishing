// 조건 게이트 스토리 — 닫힘이면 흐림 + 이유 덮기.
import type { Meta, StoryObj } from '@storybook/react';
import Gated from './Gated';
import Button from './Button';

const meta: Meta<typeof Gated> = { title: 'UI/Gated', component: Gated };
export default meta;
type Story = StoryObj<typeof Gated>;

export const Closed: Story = { args: { open: false, overlay: '명성 1500 달성', children: <Button>수주하기</Button> } };
export const Open: Story = { args: { open: true, overlay: '', children: <Button>수주하기</Button> } };
