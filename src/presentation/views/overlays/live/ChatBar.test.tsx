// 채팅 입력 줄 — Enter로 보내고, 서버 거부 이유를 보이며, 차단 목록에서 차단을 푼다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatBar from './ChatBar';

const live = vi.hoisted(() => ({
  error: null as string | null,
  sendChat: vi.fn(),
  clearChatError: vi.fn(),
}));
const moderation = vi.hoisted(() => ({
  unblock: vi.fn(async () => null),
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
    render(<ChatBar />);
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
    render(<ChatBar />);
    expect(screen.getByRole('status').textContent).toContain('계정을 만든 뒤');
  });

  it('차단 목록을 펼쳐 차단을 푼다', async () => {
    render(<ChatBar />);
    fireEvent.click(screen.getByRole('button', { name: '차단 목록' }));
    expect(screen.getByText('무례')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '해제' }));
    expect(await screen.findByText('차단을 풀었어요.')).toBeTruthy();
    expect(moderation.unblock).toHaveBeenCalledWith('b1');
  });
});
