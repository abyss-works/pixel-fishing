// 설정 창 — 물고기 그래픽 선택 카드와 알림 두 줄.
import type { Meta, StoryObj } from '@storybook/react';
import SettingsModal from './SettingsModal';

const meta: Meta<typeof SettingsModal> = { title: 'Overlays/Settings/SettingsModal', component: SettingsModal };
export default meta;
type Story = StoryObj<typeof SettingsModal>;

export const Default: Story = { args: { setToast: () => {}, onClose: () => {} } };
