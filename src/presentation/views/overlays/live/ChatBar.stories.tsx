// 메시지 창과 채팅 입력 줄 — 스테이지 왼쪽 아래. 실시간 채널은 MSW WebSocket 응답으로 연다.
import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within } from 'storybook/test';
import { FILTER_CHANNELS } from '../../../../features/display/model/messageFilter';
import type { MessageFilter } from '../../../../features/display/model/messageFilter';
import { LiveFeed, liveHandler, ME, MIXED_LOG, SYSTEM_LOG } from '../../../layouts/hud/hudStoryFixtures';
import MessageLog from '../../../ui/hud/MessageLog';
import type { Msg } from '../../../ui/hud/messageFeed';
import ChatBar from './ChatBar';

interface Args {
  log: Msg[];
  filter: MessageFilter;
  inGuild: boolean;
  guest: boolean;
}

function ChatStage({ log, filter, inGuild, guest }: Args) {
  return (
    <>
      <LiveFeed />
      <MessageLog log={log} you={ME} filter={filter} onToggle={() => {}} onPick={() => {}}
                  channels={FILTER_CHANNELS} disabledChannels={inGuild ? [] : ['guild']}
                  footer={<ChatBar inGuild={inGuild} guest={guest} />} />
    </>
  );
}

const meta: Meta<typeof ChatStage> = {
  title: 'Stage/Chat',
  component: ChatStage,
  parameters: { layout: 'fullscreen', stage: {}, msw: [liveHandler()] },
  args: { log: MIXED_LOG, filter: ['chat', 'guild'], inGuild: true, guest: false },
};
export default meta;
type Story = StoryObj<typeof ChatStage>;

/** 채팅과 길드만 켠 상태 — 시스템 토글은 꺼져 있다 */
export const ChatOnly: Story = {};

/** 모든 채널을 켠 상태 */
export const SystemOn: Story = { args: { filter: FILTER_CHANNELS } };

/** 시스템 기록만 있고 길드가 없다 — 길드 토글과 방 버튼이 흐리다 */
export const NoGuild: Story = { args: { log: SYSTEM_LOG, filter: FILTER_CHANNELS, inGuild: false } };

/** 방 버튼으로 길드 방을 고른 상태 */
export const GuildRoom: Story = {
  play: async ({ canvasElement }) => {
    const room = within(canvasElement).getByRole('button', { name: /보낼 곳/ });
    await userEvent.click(room);
    await userEvent.unhover(room);
  },
};

/** 서버가 보내기를 거부했다 — 입력 줄 위에 노치 말풍선이 뜬다 */
export const ErrorBubble: Story = {
  parameters: { msw: [liveHandler({ extra: [{ t: 'error', code: 'chat-rate' }] })] },
  args: { filter: FILTER_CHANNELS },
};

/** 게스트 — 입력 칸 대신 흐린 안내 칸 */
export const Guest: Story = { args: { guest: true, inGuild: false } };
