// 링크 버튼 스토리 — 다른 페이지로 가는 링크를 버튼 모양으로.
import type { Meta, StoryObj } from '@storybook/react';
import LinkButton from './LinkButton';

const meta: Meta<typeof LinkButton> = { title: 'UI/LinkButton', component: LinkButton };
export default meta;
type Story = StoryObj<typeof LinkButton>;

export const Ghost: Story = { args: { href: '#', variant: 'ghost', className: 'text-sm', children: '대시보드 열기 →' } };
