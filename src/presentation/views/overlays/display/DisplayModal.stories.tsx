// 화면 설정 창 — 물고기 그래픽 선택 카드(미리보기 포함).
import type { Meta, StoryObj } from '@storybook/react';
import DisplayModal from './DisplayModal';

const meta: Meta<typeof DisplayModal> = { title: 'Overlays/Settings/DisplayModal', component: DisplayModal };
export default meta;
type Story = StoryObj<typeof DisplayModal>;

export const Default: Story = { args: { onClose: () => {} } };
