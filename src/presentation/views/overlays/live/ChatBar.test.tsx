// 채팅 입력 줄 — Enter로 보내고, 서버 거부 이유를 보이며, 고른 글줄의 보낸 사람을 신고·차단한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatBar from './ChatBar';
import { createMessage } from '../../../ui/hud/messageFeed';

const live = vi.hoisted(() => ({
  error: null as string | null,
  sendChat: vi.fn(),
  clearChatError: vi.fn(),
}));
const moderation = vi.hoisted(() => ({
  block: vi.fn(async () => null),
  unblock: vi.fn(async () => null),
  report: vi.fn(async () => 'missing' as const),
}));

vi.mock('../../../../features/live/service/useLive', () => ({
  useChat: () => ({ enabled: true, you: 'me', lines: [], error: live.error }),
  sendChat: live.sendChat,
  clearChatError: live.clearChatError,
}));
vi.mock('../../../../features/live/service/useChatModeration', () => ({
  useChatModeration: () => ({ blocks: [{ uid: 'b1', nick: '무례' }], ...moderation }),
}));

describe('ChatBar', () => {
  afterEach(() => { cleanup(); live.error = null; vi.clearAllMocks(); });

  it('Enter로 보내고 입력을 비운다. 빈 입력은 보내지 않는다', () => {
    render(<ChatBar picked={null} onDone={() => {}} />);
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '안녕하세요' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenCalledWith('안녕하세요');
    expect(input.value).toBe('');
    expect(input.maxLength).toBe(100);
  });

  it('서버가 거부한 이유를 짧게 보인다', () => {
    live.error = 'chat-guest';
    render(<ChatBar picked={null} onDone={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('계정을 만든 뒤');
  });

  it('고른 글줄의 보낸 사람을 차단하고, 신고 실패는 이유를 보인다', async () => {
    const picked = createMessage(5, '나쁜 말', { channel: 'chat', author: '무례', from: { uid: 'b1', chatId: 5 } });
    const onDone = vi.fn();
    render(<ChatBar picked={picked} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: '차단' }));
    expect(await screen.findByText('차단했어요. 이 사람의 채팅이 보이지 않아요.')).toBeTruthy();
    expect(moderation.block).toHaveBeenCalledWith('b1');
    expect(onDone).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '신고' }));
    expect(await screen.findByText(/오래된 메시지는 신고할 수 없어요/)).toBeTruthy();
    expect(moderation.report).toHaveBeenCalledWith(5);
  });

  it('차단 목록을 펼쳐 차단을 푼다', async () => {
    render(<ChatBar picked={null} onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '차단 목록' }));
    expect(screen.getByText('무례')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '해제' }));
    expect(await screen.findByText('차단을 풀었어요.')).toBeTruthy();
    expect(moderation.unblock).toHaveBeenCalledWith('b1');
  });
});
