// 패치노트 범주 꼬리표 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import NoteTag from './NoteTag';

const meta: Meta<typeof NoteTag> = { title: 'UI/NoteTag', component: NoteTag };
export default meta;
type Story = StoryObj<typeof NoteTag>;

export const Feature: Story = { args: { tag: '기능' } };
export const Balance: Story = { args: { tag: '밸런스' } };
