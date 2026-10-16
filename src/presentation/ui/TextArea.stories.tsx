// 여러 줄 입력 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import TextArea from './TextArea';

const meta: Meta<typeof TextArea> = { title: 'UI/TextArea', component: TextArea };
export default meta;
type Story = StoryObj<typeof TextArea>;

export const Default: Story = { args: { rows: 4, placeholder: '개발자에게 남길 말' } };
