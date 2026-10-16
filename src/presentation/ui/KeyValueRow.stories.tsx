// 요약 줄 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import KeyValueRow from './KeyValueRow';
import Button from './Button';

const meta: Meta<typeof KeyValueRow> = { title: 'UI/KeyValueRow', component: KeyValueRow };
export default meta;
type Story = StoryObj<typeof KeyValueRow>;

export const WithAction: Story = { args: { label: '물고기 그래픽', value: 'v1 · legacy', action: <Button size="sm">변경</Button> } };
