// 체크 한 줄 — 켜짐(골드)·꺼짐(보조색).
import type { Meta, StoryObj } from '@storybook/react';
import CheckToggle from './CheckToggle';

const meta: Meta<typeof CheckToggle> = { title: 'UI/CheckToggle', component: CheckToggle };
export default meta;
type Story = StoryObj<typeof CheckToggle>;

export const On: Story = { args: { checked: true, onChange: () => {}, label: '이번 소식 다시 보지 않기' } };
export const Off: Story = { args: { checked: false, onChange: () => {}, label: '이번 소식 다시 보지 않기' } };
