// 메시지 창 스토리 — 정해진 줄 수 높이의 창 안에서 휠로 이전 기록을 거슬러 본다.
import type { Meta, StoryObj } from '@storybook/react';
import MessageLog from './MessageLog';
import { createMessage } from './messageFeed';

const TEXTS = ['항구에 닿았다.', '참치 획득!', '골드가 부족하다.', '돛단배를 구매했다.', '물때가 바뀌었다.'];
const log = Array.from({ length: 30 }, (_, i) => createMessage(i, `${TEXTS[i % TEXTS.length]} (${i + 1})`));

const meta: Meta<typeof MessageLog> = {
  title: 'Overlays/MessageLog',
  component: MessageLog,
  decorators: [Story => <div className="relative w-[640px] h-[360px] bg-surface"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof MessageLog>;

export const System: Story = { args: { log } };
