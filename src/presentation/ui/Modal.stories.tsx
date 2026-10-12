// 모달 스토리 — app/stage 레이어 (버튼으로 연다).
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import Modal from './Modal';
import Button from './Button';
import Panel from './Panel';

const meta: Meta<typeof Modal> = {
  title: 'UI/Modal',
  component: Modal,
  args: { onClose: fn() },
};

export default meta;
type Story = StoryObj<typeof Modal>;

const Opener = (args: { layer?: 'app' | 'stage'; title?: string }) => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>모달 열기</Button>
      {open && (
        <Modal layer={args.layer} title={args.title} onClose={() => setOpen(false)}>
          <Panel>
            <p className="text-sm text-text-dim">백드롭 클릭으로 닫힌다.</p>
          </Panel>
        </Modal>
      )}
    </>
  );
};

export const App: Story = {
  render: () => <Opener title="계정 관리" />,
};

export const Stage: Story = {
  render: () => <Opener layer="stage" title="스탯" />,
};
