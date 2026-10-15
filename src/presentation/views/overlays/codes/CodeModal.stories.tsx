// 코드 입력 창 — 쿠폰·지원 코드 두 줄. 서버 없이 모양만 본다(판정은 하지 않는다).
import type { Meta, StoryObj } from '@storybook/react';
import CodeModal from './CodeModal';

const meta: Meta<typeof CodeModal> = { title: 'Overlays/Settings/CodeModal', component: CodeModal };
export default meta;
type Story = StoryObj<typeof CodeModal>;

export const Default: Story = {
  args: {
    dispatch: () => ({ status: 'rejected', error: 'unknown-coupon' }) as never,
    setToast: () => {},
    onClose: () => {},
  },
};
