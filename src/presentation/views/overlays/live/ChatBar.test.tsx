// 채팅 입력 줄 — Enter로 열고 보내며, 서버 거부 이유를 보이고, 차단 목록에서 차단을 푼다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatBar from './ChatBar';
import { resetKeyScopes, useKeyBlocker } from '../../../ui/hotkeys';

function Blocker() {
  useKeyBlocker();
  return null;
}

const live = vi.hoisted(() => ({
  error: null as string | null,
  sendChat: vi.fn(),
  clearChatError: vi.fn(),
  typing: [] as boolean[],
}));
const moderation = vi.hoisted(() => ({
  unblock: vi.fn(async () => null),
}));

vi.mock('../../../../features/live/service/useLive', () => ({
  useChat: () => ({ enabled: true, you: 'me', lines: [], error: live.error }),
  sendChat: live.sendChat,
  clearChatError: live.clearChatError,
  useTypingSignal: (active: boolean) => { live.typing.push(active); },
}));
vi.mock('../../../../features/live/service/useChatModeration', () => ({
  useChatModeration: () => ({ blocks: [{ uid: 'b1', nick: '무례' }], ...moderation }),
}));

describe('ChatBar', () => {
  it('입력 줄에 포커스가 있고 글이 있는 동안만 입력 중 표시를 켠다', () => {
    live.typing = [];
    render(<ChatBar />);
    const input = screen.getByLabelText('채팅 입력');
    fireEvent.focus(input);
    expect(live.typing.at(-1)).toBe(false);
    fireEvent.change(input, { target: { value: '안' } });
    expect(live.typing.at(-1)).toBe(true);
    fireEvent.blur(input);
    expect(live.typing.at(-1)).toBe(false);
  });

  afterEach(() => { cleanup(); resetKeyScopes(); live.error = null; vi.clearAllMocks(); });

  it('Enter로 보내고 입력을 비운 뒤 입력 줄을 벗어난다. 빈 입력은 보내지 않고 벗어나기만 한다', () => {
    render(<ChatBar />);
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);
    input.focus();
    fireEvent.change(input, { target: { value: '안녕하세요' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenCalledWith('안녕하세요', 'world');
    expect(input.value).toBe('');
    expect(document.activeElement).not.toBe(input);
    expect(input.maxLength).toBe(100);
  });

  it('길드원이면 방 버튼으로 길드에 보낼 수 있고, 길드가 없으면 방 버튼 없이 월드로 보낸다', () => {
    live.sendChat.mockClear();
    const { rerender } = render(<ChatBar inGuild />);
    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 월드' }));
    const input = screen.getByLabelText('채팅 입력');
    fireEvent.change(input, { target: { value: '길드 안녕' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenLastCalledWith('길드 안녕', 'guild');
    rerender(<ChatBar />);
    expect(screen.queryByRole('button', { name: /보낼 곳/ })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: '월드 안녕' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenLastCalledWith('월드 안녕', 'world');
  });

  it('게임 화면에서 Enter를 누르면 입력 줄로 들어간다', () => {
    render(<ChatBar />);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByLabelText('채팅 입력'));
  });

  it('창이 떠 있으면 Enter로 입력 줄에 들어가지 않는다', () => {
    render(<><ChatBar /><Blocker /></>);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(document.activeElement).not.toBe(screen.getByLabelText('채팅 입력'));
  });

  it('한글 조합 중의 Enter는 보내지 않는다', () => {
    render(<ChatBar />);
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(live.sendChat).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it('Esc는 보내지 않고 입력 줄을 벗어난다', () => {
    render(<ChatBar />);
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(live.sendChat).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);
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
