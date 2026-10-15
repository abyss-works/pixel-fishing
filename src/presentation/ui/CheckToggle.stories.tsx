// 체크 한 줄 — 켜짐(골드)·꺼짐(보조색).
import type { Meta, StoryObj } from '@storybook/react';
import CheckToggle from './CheckToggle';

const meta: Meta<typeof CheckToggle> = { title: 'UI/CheckToggle', component: CheckToggle };
export default meta;
type Story = StoryObj<typeof CheckToggle>;

export const On: Story = { args: { checked: true, onChange: () => {}, label: '새 버전 소식을 자동으로 열기' } };
export const Off: Story = { args: { checked: false, onChange: () => {}, label: '새 버전 소식을 자동으로 열기' } };
