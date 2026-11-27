// 채팅 입력 줄 — Enter로 열고 보내며, 3채널 전환·10초 전체 쿨다운·서버 거부 이유를 보인다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatBar from './ChatBar';
import { resetKeyScopes, useKeyBlocker } from '../../../ui/hotkeys';
import { clearFailureNotice, showFailureNotice } from '../../../../features/gameplay/service/failureNotice';
import type { ChatError } from '../../../../features/live/model/live';

function Blocker() {
  useKeyBlocker();
  return null;
}

const live = vi.hoisted(() => ({
  error: null as ChatError | null,
  errorRetryAfterMs: null as number | null,
  globalCooldownUntil: 0,
  globalCooldownExempt: false,
  sendChat: vi.fn(),
  clearChatError: vi.fn(),
  typing: [] as boolean[],
}));

vi.mock('../../../../features/live/service/useLive', () => ({
  useChat: () => ({
    enabled: true,
    you: 'me',
    globalLines: [],
    localLines: [],
    guildLines: [],
    error: live.error,
    errorRetryAfterMs: live.errorRetryAfterMs,
    globalCooldownUntil: live.globalCooldownUntil,
    globalCooldownExempt: live.globalCooldownExempt,
  }),
  sendChat: live.sendChat,
  clearChatError: live.clearChatError,
  useTypingSignal: (active: boolean) => { live.typing.push(active); },
}));

describe('ChatBar', () => {
  afterEach(() => {
    cleanup();
    resetKeyScopes();
    clearFailureNotice();
    live.error = null;
    live.errorRetryAfterMs = null;
    live.globalCooldownUntil = 0;
    live.globalCooldownExempt = false;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

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

  it('기본 방은 지역(local)이고 Enter로 보내고 입력을 비운 뒤에도 입력 줄에 머문다. 빈 입력의 Enter는 벗어난다', () => {
    render(<ChatBar />);
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    expect(screen.getByRole('button', { name: '보낼 곳: 지역' })).toBeInTheDocument();
    input.focus();
    fireEvent.change(input, { target: { value: '안녕하세요' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenCalledWith('안녕하세요', 'local');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(input);
    expect(input.maxLength).toBe(100);
  });

  it('길드원이면 방 버튼으로 지역 -> 길드 -> 전체 -> 지역 순으로 오간다', () => {
    render(<ChatBar inGuild />);
    const input = screen.getByLabelText('채팅 입력');

    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 지역' }));
    const guildBtn = screen.getByRole('button', { name: '보낼 곳: 길드' });
    expect(guildBtn).toHaveClass('text-chat-guild', 'border-chat-guild!');
    expect(guildBtn).not.toHaveClass('border-gold');
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: '길드 안녕' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenLastCalledWith('길드 안녕', 'guild');

    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 길드' }));
    expect(screen.getByRole('button', { name: '보낼 곳: 전체' })).toHaveClass('text-chat-global', 'border-chat-global!');
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: '전체 안녕' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenLastCalledWith('전체 안녕', 'global');

    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 전체' }));
    expect(screen.getByRole('button', { name: '보낼 곳: 지역' })).toHaveClass('text-chat-local', 'border-chat-local!');
    expect(document.activeElement).toBe(input);
  });

  it('입력 중 Tab은 길드원이면 전체 -> 지역 -> 길드 순으로, 길드가 없으면 전체와 지역 사이만 오간다', () => {
    const { rerender } = render(<ChatBar inGuild />);
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    input.focus();

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '보낼 곳: 길드' })).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '보낼 곳: 전체' })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '보낼 곳: 지역' })).toBeInTheDocument();

    rerender(<ChatBar />);
    expect((screen.getByRole('button', { name: '보낼 곳: 지역' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '보낼 곳: 전체' })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '보낼 곳: 지역' })).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
  });

  it('채널별 플레이스홀더와 스위치 버튼 툴팁을 정확히 표시한다', () => {
    const { rerender } = render(<ChatBar />);
    const input = screen.getByLabelText('채팅 입력');
    expect(input).toHaveAttribute('placeholder', '지역 채팅을 적어 보세요.');

    const btn = screen.getByRole('button', { name: '보낼 곳: 지역' });
    expect(btn).not.toHaveAttribute('title');
    fireEvent.mouseEnter(btn.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('누르거나 Tab 키로 전체, 지역을 오가요.');
    expect(screen.getByRole('tooltip')).toHaveTextContent('길드에 가입하면 길드 채팅도 쓸 수 있어요.');
    fireEvent.mouseLeave(btn.parentElement!);

    rerender(<ChatBar inGuild />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: '보낼 곳: 지역' }).parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('누르거나 Tab 키로 전체, 지역, 길드를 오가요.');

    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 지역' }));
    expect(input).toHaveAttribute('placeholder', '길드원에게 말을 건네 보세요.');
    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 길드' }));
    expect(input).toHaveAttribute('placeholder', '전체는 10초마다 보낼 수 있어요.');
  });

  it('전체 채널 10초 대기 중에도 입력 칸을 비활성화하지 않고 카운터와 진행 막대를 보인다', () => {
    vi.useFakeTimers();
    const base = Date.parse('2026-11-26T12:00:00.000Z');
    vi.setSystemTime(base);
    live.globalCooldownUntil = base + 6000;

    const { container } = render(<ChatBar inGuild />);
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    // 지역 -> 길드 -> 전체
    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 지역' }));
    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 길드' }));

    expect(input.disabled).toBe(false);
    expect(input).toHaveAttribute('placeholder', '전체는 6초 뒤에 보낼 수 있어요.');
    const bar = container.querySelector('[data-cooldown-bar="global"]') as HTMLElement;
    expect(bar).toHaveClass('h-0.5', 'bg-gold');
    expect(bar.style.width).toBe('60%');

    // 미리 타이핑 허용 및 우측 초 카운터 표시
    input.focus();
    fireEvent.change(input, { target: { value: '미리 입력' } });
    expect(screen.getByText('6초')).toBeInTheDocument();

    // 대기 중 Enter는 전송하지 않고 입력값을 유지한다
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).not.toHaveBeenCalled();
    expect(input.value).toBe('미리 입력');
    expect(screen.getByRole('status')).toHaveTextContent('전체 채팅은 6초 뒤에 다시 보낼 수 있어요.');

    // 대기 중 지역이나 길드로 바꾸면 즉시 보낼 수 있다
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '보낼 곳: 지역' })).toBeInTheDocument();
    expect(screen.queryByText('6초')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenCalledWith('미리 입력', 'local');

    // 다시 전체로 바꾸고 시간이 흘러 쿨다운 종료
    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 지역' }));
    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 길드' }));
    act(() => { vi.advanceTimersByTime(6000); });
    expect(input).toHaveAttribute('placeholder', '전체는 10초마다 보낼 수 있어요.');
    expect(container.querySelector('[data-cooldown-bar="global"]')).toBeNull();
  });

  it('전체 쿨다운 면제 상태에서는 전체 채널 플레이스홀더를 바꾸고 쿨다운 표시와 전송 차단을 켜지 않는다', () => {
    vi.useFakeTimers();
    const base = Date.parse('2026-11-26T12:00:00.000Z');
    vi.setSystemTime(base);
    live.globalCooldownExempt = true;
    live.globalCooldownUntil = base + 6000;

    const { container } = render(<ChatBar />);
    const input = screen.getByLabelText('채팅 입력') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 지역' }));
    expect(screen.getByRole('button', { name: '보낼 곳: 전체' })).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', '전체는 바로 보낼 수 있어요.');
    expect(container.querySelector('[data-cooldown-bar="global"]')).toBeNull();

    input.focus();
    fireEvent.change(input, { target: { value: '첫 번째 전체' } });
    expect(screen.queryByText('6초')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenNthCalledWith(1, '첫 번째 전체', 'global');

    fireEvent.change(input, { target: { value: '두 번째 전체' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(live.sendChat).toHaveBeenNthCalledWith(2, '두 번째 전체', 'global');
    expect(screen.queryByRole('status')).toBeNull();
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

  it('서버가 거부한 이유(chat-global-cooldown 포함)를 보인다', () => {
    live.error = 'chat-guest';
    const { rerender } = render(<ChatBar />);
    expect(screen.getByRole('status').textContent).toBe('채팅은 태평양 항로가 열리면 쓸 수 있어요.');

    live.error = 'chat-global-cooldown';
    live.errorRetryAfterMs = 4200;
    rerender(<ChatBar />);
    expect(screen.getByRole('status').textContent).toBe('전체 채팅은 5초 뒤에 다시 보낼 수 있어요.');
  });

  it('거부 이유가 없으면 말풍선을 그리지 않고, 있으면 입력 줄 위에 떠서 자리를 차지하지 않는다', () => {
    const { rerender } = render(<ChatBar />);
    expect(screen.queryByRole('status')).toBeNull();
    live.error = 'chat-rate';
    rerender(<ChatBar />);
    expect(screen.getByRole('status')).toHaveClass('absolute', 'bottom-full');
  });

  describe('게스트 잠금', () => {
    it('방 버튼과 입력 칸이 자리 그대로 비활성이고 자물쇠가 붙으며 title이 없다', () => {
      const { container } = render(<ChatBar accountState="guest" />);
      expect((screen.getByLabelText('채팅 입력') as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: '보낼 곳: 지역' }) as HTMLButtonElement).disabled).toBe(true);
      expect(container.querySelector('[data-glyph="lock"]')).not.toBeNull();
      expect(container.querySelector('[title]')).toBeNull();
    });

    it('마우스를 올리거나 누르면 채팅 잠금 문안이 공용 툴팁으로 열린다', () => {
      render(<ChatBar accountState="guest" />);
      const wrap = screen.getByRole('group', { name: '채팅' }).parentElement!;
      fireEvent.mouseEnter(wrap);
      expect(screen.queryByRole('tooltip')).toBeNull();
      fireEvent.mouseMove(document.body);
      fireEvent.mouseEnter(wrap);
      const tip = screen.getByRole('tooltip');
      expect(tip).toHaveTextContent('채팅은 태평양 항로가 열리면 쓸 수 있어요.');
      expect(tip).toHaveTextContent('태평양 항로는 조각배(1단계)부터 열려요.');
    });

    it('확인 실패 상태에서는 확인 실패 전용 잠금 문안이 툴팁으로 열린다', () => {
      render(<ChatBar accountState="unverified" />);
      const wrap = screen.getByRole('group', { name: '채팅' }).parentElement!;
      fireEvent.mouseMove(document.body);
      fireEvent.mouseEnter(wrap);
      expect(screen.getByRole('tooltip')).toHaveTextContent('계정을 확인하면 쓸 수 있어요.');
    });

    it('누르거나 Enter를 눌러도 입력 줄에 들어가지 않고 아무것도 보내지 않는다', () => {
      render(<ChatBar accountState="guest" />);
      fireEvent.click(screen.getByRole('group', { name: '채팅' }));
      fireEvent.click(screen.getByRole('button', { name: '보낼 곳: 지역' }));
      fireEvent.keyDown(document.body, { key: 'Enter' });
      expect(document.activeElement).toBe(document.body);
      expect(live.sendChat).not.toHaveBeenCalled();
    });

    it('접힌 게스트는 펼치기 버튼만 남고 잠금 요소를 그리지 않는다', () => {
      render(<ChatBar accountState="guest" folded onUnfold={() => {}} />);
      expect(screen.getByRole('button', { name: '메시지 창 펼치기' })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: '채팅' })).toBeNull();
    });
  });
});

describe('요청 실패 안내의 오류 자리', () => {
  afterEach(() => { cleanup(); resetKeyScopes(); clearFailureNotice(); live.error = null; });

  it('메시지 창이 접혀 있으면 오류 자리에 보인다', () => {
    showFailureNotice('요청 실패 안내');
    render(<ChatBar folded />);
    expect(screen.getByText('요청 실패 안내')).toBeInTheDocument();
  });

  it('메시지 창이 펼쳐져 있으면 오류 자리에 보이지 않는다', () => {
    showFailureNotice('요청 실패 안내');
    render(<ChatBar />);
    expect(screen.queryByText('요청 실패 안내')).toBeNull();
  });

  it('채팅 거부 이유와 겹치면 채팅 거부 이유가 먼저다', () => {
    showFailureNotice('요청 실패 안내');
    live.error = 'chat-rate';
    render(<ChatBar folded />);
    expect(screen.getByText(/메시지를 너무 빨리 보내고 있어요/)).toBeInTheDocument();
    expect(screen.queryByText('요청 실패 안내')).toBeNull();
  });
});
