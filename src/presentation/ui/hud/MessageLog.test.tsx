import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FILTER_CHANNELS, toggleChannel } from '../../../features/display/model/messageFilter';
import type { MessageFilter } from '../../../features/display/model/messageFilter';
import MessageLog from './MessageLog';
import { createMessage, mergeMessages } from './messageFeed';
import type { Msg } from './messageFeed';

const logOf = (n: number) => Array.from({ length: n }, (_, i) => createMessage(i, `메시지 ${i}`));
const chatAt = (id: number, at: Date, uid = 'u') =>
  createMessage(id, `채팅 ${id}`, { channel: 'chat', author: '가람', now: at, from: { uid, chatId: id } });

/** 채널 토글 상태를 가진 메시지 창 — 화면이 쓰는 것과 같은 토글 규칙 */
function Filtered({ log, initial = FILTER_CHANNELS }: { log: Msg[]; initial?: MessageFilter }) {
  const [filter, setFilter] = useState<MessageFilter>(initial);
  return <MessageLog log={log} filter={filter} onToggle={(c, present) => setFilter(f => toggleChannel(f, c, present))} />;
}

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

  it('채널이 하나면 채널 토글을 그리지 않는다', () => {
    render(<Filtered log={logOf(3)} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('기록 수와 무관하게 같은 높이의 창을 그린다', () => {
    render(<MessageLog log={[]} />);
    const empty = screen.getByRole('log').style.height;
    cleanup();
    render(<MessageLog log={logOf(50)} />);
    expect(empty).not.toBe('');
    expect(screen.getByRole('log').style.height).toBe(empty);
  });

  it('채널이 둘이면 채팅·시스템 토글을 그리고, 둘 다 켜면 전체를 보인다. 마지막 하나는 끌 수 없다', () => {
    const chat = createMessage(1, '안녕', { channel: 'chat', author: '가람', from: { uid: 'u', chatId: 1 } });
    render(<Filtered log={[...logOf(2), chat]} />);
    const log = () => screen.getByRole('log');
    expect(log().children).toHaveLength(3);
    fireEvent.click(screen.getByRole('checkbox', { name: '시스템' }));
    expect(log().children).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox', { name: '채팅' }));
    expect(screen.getByRole('checkbox', { name: '채팅' })).toHaveAttribute('aria-checked', 'true');
    expect(log().children).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox', { name: '시스템' }));
    expect(log().children).toHaveLength(3);
  });

  it('길드 글줄이 있으면 길드 토글을 더하고, 기록에 없는 채널은 마지막 하나 판정에 넣지 않는다', () => {
    const guild = createMessage(2, '길드 안녕', { channel: 'guild', author: '나루', from: { uid: 'g', chatId: 2 } });
    render(<Filtered log={[...logOf(1), guild]} />);
    expect(screen.getAllByRole('checkbox').map(c => c.textContent)).toEqual(['길드', '시스템']);
    expect(screen.getByRole('log').textContent).toContain('[길드]');
    fireEvent.click(screen.getByRole('checkbox', { name: '시스템' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '길드' }));
    expect(screen.getByRole('checkbox', { name: '길드' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('log').children).toHaveLength(1);
  });

  it('꺼 둔 채널에 새 글줄이 오면 토글 옆에 점을 찍는다', () => {
    const base = [...logOf(2), chatAt(1, new Date(Date.now() - 60_000))];
    const { rerender } = render(<Filtered log={base} initial={['system']} />);
    expect(screen.queryByText('새 메시지')).not.toBeInTheDocument();
    rerender(<Filtered log={[...base, chatAt(2, new Date(Date.now() + 60_000))]} initial={['system']} />);
    expect(screen.getByText('새 메시지')).toBeInTheDocument();
  });

  it('내 채팅 이름은 골드, 다른 사람 이름은 하늘색이다', () => {
    const at = new Date();
    render(<MessageLog log={[chatAt(1, at, 'me'), chatAt(2, at, 'other')]} you="me" onPick={() => {}} />);
    const [mine, other] = screen.getAllByRole('button', { name: '가람:' });
    expect(mine).toHaveClass('text-gold');
    expect(other).toHaveClass('text-accent');
    expect(other).not.toHaveClass('text-gold');
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

  it('채널 표시를 바꾸면 위로 올려 읽던 중이어도 맨 아래부터 보인다', () => {
    const chat = Array.from({ length: 5 }, (_, i) => chatAt(i, new Date(Date.now() + i)));
    render(<Filtered log={[...logOf(20), ...chat]} />);
    const list = screen.getByRole('log');
    fakeLayout(list);
    scrollTo(list, 0);
    fireEvent.click(screen.getByRole('checkbox', { name: '채팅' }));
    expect(list.scrollTop).toBe(20 * 20);
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
