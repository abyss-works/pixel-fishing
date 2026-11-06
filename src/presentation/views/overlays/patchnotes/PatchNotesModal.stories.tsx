// 패치노트 창 — 버전별 펼침 목록.
import type { Meta, StoryObj } from '@storybook/react';
import PatchNotesModal from './PatchNotesModal';

const meta: Meta<typeof PatchNotesModal> = { title: 'Overlays/Settings/PatchNotesModal', component: PatchNotesModal };
export default meta;
type Story = StoryObj<typeof PatchNotesModal>;

export const Default: Story = { args: { onClose: () => {} } };
