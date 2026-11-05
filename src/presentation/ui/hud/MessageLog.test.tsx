import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MessageLog from './MessageLog';
import { createMessage } from './messageFeed';

const logOf = (n: number) => Array.from({ length: n }, (_, i) => createMessage(i, `메시지 ${i}`));

describe('메시지 창', () => {
  afterEach(cleanup);

  it('보관된 기록 전체를 하나의 스크롤 목록으로 그린다', () => {
    render(<MessageLog log={logOf(20)} />);
    const list = screen.getByRole('log', { name: '메시지 기록' });
    expect(list.children).toHaveLength(20);
  });

  it('펼치기 버튼 없이 바로 기록을 보인다', () => {
    render(<MessageLog log={logOf(3)} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('글줄 앞에 채널 머리표를 붙인다', () => {
    render(<MessageLog log={logOf(1)} />);
    expect(screen.getByRole('log').textContent).toContain('[시스템]');
  });

  it('채널이 하나면 채널 탭을 그리지 않는다', () => {
    render(<MessageLog log={logOf(3)} />);
    expect(screen.queryByRole('button', { name: '시스템' })).not.toBeInTheDocument();
  });

  it('기록 수와 무관하게 같은 높이의 창을 그린다', () => {
    render(<MessageLog log={[]} />);
    const empty = screen.getByRole('log').style.height;
    cleanup();
    render(<MessageLog log={logOf(50)} />);
    expect(empty).not.toBe('');
    expect(screen.getByRole('log').style.height).toBe(empty);
  });

  it('채널이 둘이면 전체와 채널별 탭을 그리고, 처음에는 전체를 보인다', () => {
    const chat = createMessage(1, '안녕', { channel: 'chat', author: '가람', from: { uid: 'u', chatId: 1 } });
    render(<MessageLog log={[...logOf(2), chat]} />);
    expect(screen.getByRole('log').children).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '채팅' }));
    expect(screen.getByRole('log').children).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(screen.getByRole('log').children).toHaveLength(3);
  });

  it('채팅 글줄의 보낸 사람을 누르면 그 글줄을 onPick으로 넘기고, footer를 창 아래에 그린다', () => {
    const chat = createMessage(7, '안녕', { channel: 'chat', author: '가람', from: { uid: 'u', chatId: 7 } });
    const onPick = vi.fn();
    render(<MessageLog log={[chat]} onPick={onPick} footer={<input aria-label="채팅 입력" />} />);
    fireEvent.click(screen.getByRole('button', { name: '가람:' }));
    expect(onPick).toHaveBeenCalledWith(chat);
    expect(screen.getByLabelText('채팅 입력')).toBeInTheDocument();
  });
});
