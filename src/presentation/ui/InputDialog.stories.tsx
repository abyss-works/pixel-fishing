// 입력 창 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import InputDialog from './InputDialog';

const meta: Meta<typeof InputDialog> = { title: 'UI/InputDialog', component: InputDialog };
export default meta;
type Story = StoryObj<typeof InputDialog>;

export const Default: Story = {
  args: { title: '이사 코드 불러오기', label: '이사 코드', placeholder: '이사 코드를 붙여넣으세요',
    confirmLabel: '불러오기', onSubmit: () => {}, onCancel: () => {} },
};
