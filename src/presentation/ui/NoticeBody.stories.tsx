// 안내문 본문 스토리 — 핵심 문장·설명·참고의 위계.
import type { Meta, StoryObj } from '@storybook/react';
import NoticeBody from './NoticeBody';

const meta: Meta<typeof NoticeBody> = {
  title: 'UI/NoticeBody',
  component: NoticeBody,
};

export default meta;
type Story = StoryObj<typeof NoticeBody>;

export const Full: Story = {
  args: {
    lead: '게임이 업데이트되어 이 화면은 더 진행할 수 없어요.',
    children: <p>지금까지의 진행은 서버에 안전하게 저장되어 있어요. 새로고침하면 바로 이어서 플레이할 수 있어요.</p>,
    aside: '방금 마지막 행동 하나는 저장되지 않았을 수 있어요.',
  },
};

export const LeadOnly: Story = {
  args: { lead: '로그아웃할까요? 이 기기는 새 게스트로 다시 시작해요.' },
};
