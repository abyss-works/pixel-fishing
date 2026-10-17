// 알림 창 스토리 — 안내만 / 복사할 값과 함께.
import type { Meta, StoryObj } from '@storybook/react';
import NoticeDialog from './NoticeDialog';

const meta: Meta<typeof NoticeDialog> = { title: 'UI/NoticeDialog', component: NoticeDialog };
export default meta;
type Story = StoryObj<typeof NoticeDialog>;

export const Message: Story = { args: { title: '복사 완료', body: '어종 현황 JSON을 클립보드에 복사했다.', onClose: () => {} } };
export const CopyFallback: Story = {
  args: { title: '직접 복사', body: '복사가 막혀 있어요. 아래 값을 직접 복사하세요.', value: 'a1b2c3d4-…', onClose: () => {} },
};
