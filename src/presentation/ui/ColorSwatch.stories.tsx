// 색 칸 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import ColorSwatch from './ColorSwatch';

const meta: Meta<typeof ColorSwatch> = { title: 'UI/ColorSwatch', component: ColorSwatch };
export default meta;
type Story = StoryObj<typeof ColorSwatch>;

export const Small: Story = { args: { color: '#ba68c8' } };
export const Big: Story = { args: { color: '#ba68c8', big: true } };
