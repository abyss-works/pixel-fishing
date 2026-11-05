import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MessageLog from './MessageLog';
import { createMessage, mergeMessages } from './messageFeed';

const logOf = (n: number) => Array.from({ length: n }, (_, i) => createMessage(i, `메시지 ${i}`));
const chatAt = (id: number, at: Date, uid = 'u') =>
  createMessage(id, `채팅 ${id}`, { channel: 'chat', author: '가람', now: at, from: { uid, chatId: id } });

/** jsdom은 배치를 하지 않는다 — 한 줄 20px, 창 160px(8줄)로 스크롤 크기를 흉내 낸다 */
function fakeLayout(el: HTMLElement) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => el.children.length * 20 });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 160 });
}
const scrollTo = (el: HTMLElement, top: number) => { el.scrollTop = top; fireEvent.scroll(el); };

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

  it('최근 채팅 묶음이 기록 앞쪽에 끼어들어도 맨 아래(최신)를 보인다', () => {
    const now = Date.now();
    const system = [createMessage(100, '항구에 닿았다.', { now: new Date(now) })];
    const { rerender } = render(<MessageLog log={system} />);
    const list = screen.getByRole('log');
    fakeLayout(list);
    // 접속 직후 받은 최근 채팅 — 시스템 메시지보다 오래돼 앞쪽에 합쳐진다. 마지막 글줄은 그대로다
    const batch = Array.from({ length: 30 }, (_, i) => chatAt(i, new Date(now - 60_000 + i)));
    rerender(<MessageLog log={mergeMessages(system, batch)} />);
    expect(list.scrollTop).toBe(list.scrollHeight);
  });

  it('위로 올려 읽는 중이면 새 글줄이 와도 자리를 지키고, 맨 아래로 내리면 다시 따라 내려간다', () => {
    const { rerender } = render(<MessageLog log={logOf(20)} />);
    const list = screen.getByRole('log');
    fakeLayout(list);
    rerender(<MessageLog log={logOf(21)} />);
    expect(list.scrollTop).toBe(21 * 20);
    scrollTo(list, 40);
    rerender(<MessageLog log={logOf(22)} />);
    expect(list.scrollTop).toBe(40);
    scrollTo(list, 22 * 20 - 160);
    rerender(<MessageLog log={logOf(23)} />);
    expect(list.scrollTop).toBe(23 * 20);
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
