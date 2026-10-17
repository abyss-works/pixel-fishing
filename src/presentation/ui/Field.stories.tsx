// 입력 필드 묶음 스토리 — 기본 / 도움말 / 오류.
import type { Meta, StoryObj } from '@storybook/react';
import Field from './Field';
import TextInput from './TextInput';

const meta: Meta<typeof Field> = { title: 'UI/Field', component: Field };
export default meta;
type Story = StoryObj<typeof Field>;

export const Basic: Story = { args: { label: '이메일', children: <TextInput type="email" /> } };
export const WithHint: Story = { args: { label: '비밀번호', hint: '6자 이상', children: <TextInput type="password" /> } };
export const WithError: Story = { args: { label: '골드', error: '숫자를 올바르게 입력하세요.', children: <TextInput type="number" /> } };
