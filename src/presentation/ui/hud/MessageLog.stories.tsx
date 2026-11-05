// 메시지 창 스토리 — 정해진 줄 수 높이의 창 안에서 휠로 이전 기록을 거슬러 본다. 채팅이 섞이면 채널 토글이 생긴다.
import type { Meta, StoryObj } from '@storybook/react';
import { FILTER_CHANNELS } from '../../../features/display/model/messageFilter';
import MessageLog from './MessageLog';
import { createMessage, mergeMessages } from './messageFeed';

const TEXTS = ['항구에 닿았다.', '참치 획득!', '골드가 부족하다.', '돛단배를 구매했다.', '물때가 바뀌었다.'];
const log = Array.from({ length: 30 }, (_, i) => createMessage(i, `${TEXTS[i % TEXTS.length]} (${i + 1})`));
const chat = [
  createMessage(1, '안녕하세요', { channel: 'chat', author: '가람', from: { uid: 'me', chatId: 1 } }),
  createMessage(2, '반가워요', { channel: 'chat', author: '나래', from: { uid: 'other', chatId: 2 } }),
];

const meta: Meta<typeof MessageLog> = {
  title: 'Overlays/MessageLog',
  component: MessageLog,
  decorators: [Story => <div className="relative w-[640px] h-[360px] bg-surface"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof MessageLog>;

export const System: Story = { args: { log } };

/** 채팅이 섞인 기록 — 내 이름(가람)은 골드, 다른 사람 이름은 하늘색 */
export const WithChat: Story = { args: { log: mergeMessages(log, chat), you: 'me', filter: FILTER_CHANNELS, onToggle: () => {}, onPick: () => {} } };
