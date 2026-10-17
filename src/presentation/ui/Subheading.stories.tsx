// 소제목 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import Subheading from './Subheading';

const meta: Meta<typeof Subheading> = { title: 'UI/Subheading', component: Subheading };
export default meta;
type Story = StoryObj<typeof Subheading>;

export const Default: Story = { args: { children: '아이템' } };
