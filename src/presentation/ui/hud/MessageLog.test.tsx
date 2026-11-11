import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
/** 채널 토글 칩 */
const chips = () => within(screen.getByRole('group', { name: '메시지 채널' })).getAllByRole('button');

describe('메시지 창', () => {
  afterEach(cleanup);

  it('보관된 기록 전체를 하나의 스크롤 목록으로 그린다', () => {
    render(<MessageLog log={logOf(20)} />);
    const list = screen.getByRole('log', { name: '메시지 기록' });
    expect(list.children).toHaveLength(20);
  });

  it('툴팁을 단 대목에 마우스를 올리면 목록이 뜨고 글줄 문구는 그대로다', () => {
    const tip = { target: '40', rows: [{ label: '생명의 기운(일반)', value: '+38' }, { label: '생명의 기운(희귀)', value: '+2' }] };
    render(<MessageLog log={[createMessage(1, '생명의 기운 40개를 얻었어요!', { tone: 'gold', tip })]} />);
    expect(screen.getByRole('log')).toHaveTextContent('생명의 기운 40개를 얻었어요!');
    fireEvent.mouseEnter(screen.getByText('40'));
    const bubble = screen.getByRole('tooltip');
    expect(bubble).toHaveTextContent('생명의 기운(일반)');
    expect(bubble).toHaveTextContent('+38');
    expect(bubble).toHaveTextContent('생명의 기운(희귀)');
  });

  it('툴팁 대목이 글줄에 없으면 툴팁 없이 문구만 그린다', () => {
    render(<MessageLog log={[createMessage(1, '다른 문구', { tip: { target: '40', rows: [] } })]} />);
    expect(screen.getByRole('log')).toHaveTextContent('다른 문구');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('펼치기 버튼 없이 바로 기록을 보인다', () => {
    render(<MessageLog log={logOf(3)} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('글줄 앞에 채널 머리표를 붙이지 않고, 길드 글줄은 길드 색으로 그린다', () => {
    const guild = createMessage(2, '길드 안녕', { channel: 'guild', author: '나루', from: { uid: 'g', chatId: 2 } });
    render(<MessageLog log={[...logOf(1), guild]} />);
    expect(screen.getByRole('log').textContent).not.toMatch(/\[(시스템|채팅|길드)\]/);
    const lines = [...screen.getByRole('log').children];
    expect(lines.find(l => l.textContent?.includes('길드 안녕'))?.className).toContain('text-guild');
    expect(lines[0].className).not.toContain('text-guild');
  });

  it('늘 보일 채널을 주면 기록과 관계없이 토글을 그리고, 쓸 수 없는 채널은 회색으로 꺼 둔다', () => {
    render(<MessageLog log={logOf(1)} filter={FILTER_CHANNELS} onToggle={() => {}} channels={FILTER_CHANNELS} disabledChannels={['guild']} />);
    expect(chips().map(c => c.textContent)).toEqual(['채팅', '길드', '시스템']);
    expect((screen.getByRole('button', { name: '길드' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '채팅' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('켜진 채널 칩은 일반 켜짐 단계라 골드로 세우지 않고, 꺼진 칩은 테두리 없이 보조색이다', () => {
    render(<MessageLog log={logOf(1)} filter={['chat', 'system']} onToggle={() => {}} channels={FILTER_CHANNELS} />);
    const chat = screen.getByRole('button', { name: '채팅', pressed: true });
    expect(chat).toHaveClass('border-line', 'text-text');
    expect(chat).not.toHaveClass('text-gold');
    expect(screen.getByRole('button', { name: '길드', pressed: false })).toHaveClass('border-transparent', 'text-text-dim');
  });

  it('꺼 둔 채널의 새 글 점은 네모 골드 점이다', () => {
    const { container } = render(<Filtered log={[...logOf(1), chatAt(1, new Date(Date.now() + 60_000))]} initial={['system']} />);
    const dot = container.querySelector('.bg-gold');
    expect(dot).not.toBeNull();
    expect(dot).not.toHaveClass('rounded-full');
  });

  it('창 폭은 400px이고, 기록 상자는 노치 틀이며 바탕은 마우스를 올렸거나 입력 중일 때만 보인다', () => {
    const { container } = render(<MessageLog log={logOf(1)} footer={<input aria-label="채팅 입력" />} />);
    expect(container.firstElementChild).toHaveClass('w-[min(400px,58%)]');
    const list = screen.getByRole('log');
    expect(list).toHaveClass('pf-notch', 'border-transparent');
    expect(list).not.toHaveClass('rounded-sm');
    expect(list.className).toMatch(/hover:bg-/);
    expect(list.className).toMatch(/group-has-\[input:focus\]:bg-/);
  });

  it('채널이 하나면 채널 토글을 그리지 않는다', () => {
    render(<Filtered log={logOf(3)} />);
    expect(screen.queryByRole('group', { name: '메시지 채널' })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: '시스템' }));
    expect(log().children).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '채팅' }));
    expect(screen.getByRole('button', { name: '채팅' })).toHaveAttribute('aria-pressed', 'true');
    expect(log().children).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '시스템' }));
    expect(log().children).toHaveLength(3);
  });

  it('길드 글줄이 있으면 길드 토글을 더하고, 기록에 없는 채널은 마지막 하나 판정에 넣지 않는다', () => {
    const guild = createMessage(2, '길드 안녕', { channel: 'guild', author: '나루', from: { uid: 'g', chatId: 2 } });
    render(<Filtered log={[...logOf(1), guild]} />);
    expect(chips().map(c => c.textContent)).toEqual(['길드', '시스템']);
    expect(screen.getByRole('log').textContent).toContain('길드 안녕');
    fireEvent.click(screen.getByRole('button', { name: '시스템' }));
    fireEvent.click(screen.getByRole('button', { name: '길드' }));
    expect(screen.getByRole('button', { name: '길드' })).toHaveAttribute('aria-pressed', 'true');
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
    const [mine, other] = screen.getAllByRole('button', { name: '가람' });
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
    fireEvent.click(screen.getByRole('button', { name: '채팅' }));
    expect(list.scrollTop).toBe(20 * 20);
  });

  it('채팅 글줄의 보낸 사람을 누르면 그 글줄을 onPick으로 넘기고, footer를 창 아래에 그린다', () => {
    const chat = createMessage(7, '안녕', { channel: 'chat', author: '가람', from: { uid: 'u', chatId: 7 } });
    const onPick = vi.fn();
    render(<MessageLog log={[chat]} onPick={onPick} footer={<input aria-label="채팅 입력" />} />);
    fireEvent.click(screen.getByRole('button', { name: '가람' }));
    expect(onPick).toHaveBeenCalledWith(chat);
    expect(screen.getByLabelText('채팅 입력')).toBeInTheDocument();
  });

  it('모바일 레이아웃에서는 격자 행을 차지하지 않고 채팅 묶음 안에서 폭 전체를 쓴다', () => {
    const { container } = render(<Filtered log={logOf(2)} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('mobile:relative');
    // PC 레이아웃의 왼쪽과 아래 12px 오프셋이 모바일 레이아웃에서 풀려야 채팅 묶음의 8px 안쪽 여백에 맞는다
    expect(root.className).toContain('mobile:left-auto');
    expect(root.className).toContain('mobile:bottom-auto');
    expect(root.className).toContain('mobile:w-full');
    // 채팅은 채팅과 헤더 층이다(PC 레이아웃과 모바일 레이아웃 모두)
    expect(root.className).toContain('z-(--z-chrome)');
    expect(root.className).not.toMatch(/row-start|col-span/);
  });

  it('PC 레이아웃의 기록 상자는 평소 테두리가 투명하고 호버와 입력 때만 바탕을 보인다', () => {
    render(<Filtered log={logOf(2)} />);
    const cls = screen.getByRole('log').className;
    expect(cls).toContain('border-transparent');
    expect(cls).toContain('hover:bg-');
    expect(cls).toContain('group-has-[input:focus]:bg-');
  });

});
