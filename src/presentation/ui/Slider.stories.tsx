// 슬라이더 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import Slider from './Slider';

const meta: Meta<typeof Slider> = { title: 'UI/Slider', component: Slider };
export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = { args: { min: 0, max: 59, defaultValue: 30, 'aria-label': '주기 내 시각 (분)' } };
