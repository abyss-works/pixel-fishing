// 채팅 입력 줄 — Enter로 열고 보내며, 서버 거부 이유를 보인다.
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

vi.mock('../../../../features/live/service/useLive', () => ({
  useChat: () => ({ enabled: true, you: 'me', lines: [], error: live.error }),
  sendChat: live.sendChat,
  clearChatError: live.clearChatError,
  useTypingSignal: (active: boolean) => { live.typing.push(active); },
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

  it('Enter로 보내고 입력을 비운 뒤에도 입력 줄에 머문다. 빈 입력의 Enter는 보내지 않고 벗어난다', () => {
    render(<ChatBar />);
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: '안녕하세요' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenCalledWith('안녕하세요', 'world');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(input);
    expect(input.maxLength).toBe(100);
  });

  it('길드원이면 방 버튼으로 길드에 보낼 수 있고, 길드가 없으면 방 버튼이 회색으로 꺼진 채 월드로 보낸다', () => {
    live.sendChat.mockClear();
    const { rerender } = render(<ChatBar inGuild />);
    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 월드' }));
    const input = screen.getByLabelText('채팅 입력');
    fireEvent.change(input, { target: { value: '길드 안녕' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenLastCalledWith('길드 안녕', 'guild');
    rerender(<ChatBar />);
    expect((screen.getByRole('button', { name: /보낼 곳/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: '월드 안녕' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenLastCalledWith('월드 안녕', 'world');
  });

  it('입력 중 Tab은 길드원이면 보낼 곳을 월드와 길드로 번갈아 바꾸고 입력 줄에 머문다', () => {
    render(<ChatBar inGuild />);
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '보낼 곳: 길드' })).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: '길드 안녕' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenLastCalledWith('길드 안녕', 'guild');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '보낼 곳: 월드' })).toBeInTheDocument();
  });

  it('길드가 없으면 입력 중 Tab을 눌러도 월드에 머문다', () => {
    render(<ChatBar />);
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '보낼 곳: 월드' })).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
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

  it('거부 이유가 없으면 말풍선을 그리지 않고, 있으면 입력 줄 위에 떠서 자리를 차지하지 않는다', () => {
    const { rerender } = render(<ChatBar />);
    expect(screen.queryByRole('status')).toBeNull();
    live.error = 'chat-rate';
    rerender(<ChatBar />);
    expect(screen.getByRole('status')).toHaveClass('absolute', 'bottom-full');
  });

  it('입력 안내는 가운뎃점 없이 Enter로 채팅이고, 길드 방이면 Enter로 길드 채팅이다', () => {
    render(<ChatBar inGuild />);
    expect(screen.getByLabelText('채팅 입력')).toHaveAttribute('placeholder', 'Enter로 채팅');
    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 월드' }));
    expect(screen.getByLabelText('채팅 입력')).toHaveAttribute('placeholder', 'Enter로 길드 채팅');
    expect(screen.getByRole('button', { name: '보낼 곳: 길드' })).toHaveClass('text-guild', 'border-gold');
  });

  it('방 버튼은 브라우저 기본 툴팁 대신 게임 툴팁으로 설명과 꺼진 이유를 보인다', () => {
    render(<ChatBar />);
    const button = screen.getByRole('button', { name: '보낼 곳: 월드' });
    expect(button).not.toHaveAttribute('title');
    fireEvent.mouseEnter(button.parentElement!);
    expect(screen.getByText('길드에 들어가면 길드 채팅을 쓸 수 있어요.')).toBeInTheDocument();
  });

  it('게스트는 입력 칸 대신 흐린 안내 칸을 보고, Enter로 입력 줄에 들어가지 않는다', () => {
    render(<ChatBar guest />);
    expect(screen.queryByLabelText('채팅 입력')).not.toBeInTheDocument();
    expect(screen.getByText('채팅은 계정을 만든 뒤 쓸 수 있어요')).toBeInTheDocument();
    expect((screen.getByRole('button', { name: '보낼 곳: 월드' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(document.activeElement).toBe(document.body);
  });


});
