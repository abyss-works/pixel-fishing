import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FILTER_CHANNELS, toggleChannel } from '../../../features/display/model/messageFilter';
import type { MessageFilter } from '../../../features/display/model/messageFilter';
import MessageLog from './MessageLog';
import { createMessage, mergeMessages } from './messageFeed';
import type { Msg } from './messageFeed';

const logOf = (n: number) => Array.from({ length: n }, (_, i) => createMessage(i, `메시지 ${i}`));
const chatAt = (id: number, at: Date, uid = 'u', channel: 'global' | 'local' = 'local') =>
  createMessage(id, `채팅 ${id}`, { channel, author: '가람', now: at, from: { uid, chatId: id } });

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
    expect(within(bubble).getByText('(일반)')).toHaveAttribute('data-rarity', 'common');
    expect(within(bubble).getByText('(희귀)')).toHaveAttribute('data-rarity', 'rare');
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

  it('대괄호 채널 머리표 없이 왼쪽 2px 채널 색선과 오른쪽 상단 시각으로 배치하고, 길드 글줄은 길드 색으로 그린다', () => {
    const globalMsg = createMessage(1, '전체 안녕', { channel: 'global', author: '하늘', from: { uid: 'w', chatId: 1 } });
    const localMsg = createMessage(2, '지역 안녕', { channel: 'local', author: '바다', from: { uid: 'l', chatId: 2 } });
    const guildMsg = createMessage(3, '길드 안녕', { channel: 'guild', author: '나루', from: { uid: 'g', chatId: 3 } });
    render(<MessageLog log={[...logOf(1), globalMsg, localMsg, guildMsg]} />);
    const logEl = screen.getByRole('log');
    expect(logEl.textContent).not.toMatch(/\[(전체|지역|길드|시스템|채팅)\]/);

    const lines = [...logEl.children];
    expect(lines[0].querySelector('.bg-chat-system')).toHaveClass('w-0.5', 'shrink-0', 'self-stretch');
    expect(lines[1].querySelector('.bg-chat-global')).toHaveClass('w-0.5', 'shrink-0', 'self-stretch');
    expect(lines[2].querySelector('.bg-chat-local')).toHaveClass('w-0.5', 'shrink-0', 'self-stretch');
    expect(lines[3].querySelector('.bg-chat-guild')).toHaveClass('w-0.5', 'shrink-0', 'self-stretch');
    expect(lines[3].className).toContain('text-guild');
    expect(lines[0].className).not.toContain('text-guild');
    expect(lines[0].lastElementChild).toHaveClass('pf-accent', 'tabular-nums');
  });

  it('늘 보일 채널을 주면 전체·지역·길드·시스템 순서로 토글을 그리고, 쓸 수 없는 채널은 회색으로 꺼 둔다', () => {
    render(<MessageLog log={logOf(1)} filter={FILTER_CHANNELS} onToggle={() => {}} channels={FILTER_CHANNELS} disabledChannels={['guild']} />);
    expect(chips().map(c => c.textContent)).toEqual(['전체', '지역', '길드', '시스템']);
    expect((screen.getByRole('button', { name: '길드' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '전체' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '지역' }) as HTMLButtonElement).disabled).toBe(false);
    for (const chip of chips()) {
      expect(chip).not.toHaveClass('w-[66px]');
      expect(chip).toHaveClass('px-1.5!', 'gap-1!');
    }
  });

  it('켜진 채널 칩은 채널색 테두리·채운 사각형·밝은 글자이고, 꺼진 칩은 어두운 테두리·속이 빈 1px 채널색 사각형·흐린 글자이며 체크 아이콘이 없다', () => {
    render(<MessageLog log={logOf(1)} filter={['global', 'local', 'system']} onToggle={() => {}} channels={FILTER_CHANNELS} />);
    const globalChip = screen.getByRole('button', { name: '전체', pressed: true });
    expect(globalChip).toHaveClass('border-chat-global!', 'text-text');
    expect(globalChip).not.toHaveClass('text-gold');
    expect(globalChip.querySelector('[data-glyph="check"]')).toBeNull();
    expect(globalChip.querySelector('.bg-chat-global')).toHaveClass('size-2', 'shrink-0', 'border', 'border-chat-global');

    const guildChip = screen.getByRole('button', { name: '길드', pressed: false });
    expect(guildChip).toHaveClass('border-line-dim!', 'text-text-dim');
    expect(guildChip.querySelector('[data-glyph="check"]')).toBeNull();
    expect(guildChip.querySelector('.bg-transparent')).toHaveClass('size-2', 'shrink-0', 'border', 'border-chat-guild');
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

  it('채널이 둘이면 지역·시스템 토글을 그리고, 둘 다 켜면 전체를 보인다. 마지막 하나는 끌 수 없다', () => {
    const localMsg = createMessage(1, '안녕', { channel: 'local', author: '가람', from: { uid: 'u', chatId: 1 } });
    render(<Filtered log={[...logOf(2), localMsg]} />);
    const log = () => screen.getByRole('log');
    expect(log().children).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '시스템' }));
    expect(log().children).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '지역' }));
    expect(screen.getByRole('button', { name: '지역' })).toHaveAttribute('aria-pressed', 'true');
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
    fireEvent.click(screen.getByRole('button', { name: '지역' }));
    expect(list.scrollTop).toBe(20 * 20);
  });

  it('채팅 글줄의 보낸 사람을 누르면 그 글줄을 onPick으로 넘기고, topSlot과 footer를 배치한다', () => {
    const chat = createMessage(7, '안녕', { channel: 'local', author: '가람', from: { uid: 'u', chatId: 7 } });
    const { rerender } = render(
      <MessageLog log={[chat]} topSlot={<div data-testid="notice-strip">공지 띠</div>} footer={<input aria-label="채팅 입력" />} />,
    );
    expect(screen.getByTestId('notice-strip')).toBeInTheDocument();
    expect(screen.getByLabelText('채팅 입력')).toBeInTheDocument();

    // 접힘 상태에서는 topSlot과 기록이 숨고 footer만 남는다
    rerender(
      <MessageLog log={[chat]} folded topSlot={<div data-testid="notice-strip">공지 띠</div>} footer={<input aria-label="채팅 입력" />} />,
    );
    expect(screen.queryByTestId('notice-strip')).not.toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.getByLabelText('채팅 입력')).toBeInTheDocument();
  });

  it('하단 HUD 흐름 안에서 격자 행을 차지하지 않고 모바일 레이아웃에서는 폭 전체를 쓴다', () => {
    const { container } = render(<Filtered log={logOf(2)} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('relative');
    expect(root.className).not.toContain('absolute');
    expect(root.className).toContain('mobile:w-full');
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

  it('staffBadge가 있는 운영진 메시지는 mine 여부와 무관하게 별 아이콘과 닉네임이 text-staff이고 본문 채널 색상을 유지하며, 일반 플레이어는 기존 닉네임 색상을 유지한다', () => {
    const at = new Date();
    const myAdminMsg = createMessage(1, '공지 확인', {
      channel: 'local', author: '내관리자', now: at, from: { uid: 'me', chatId: 1 }, staffBadge: 'admin',
    });
    const otherAdminMsg = createMessage(2, '안내입니다', {
      channel: 'local', author: '타관리자', now: at, from: { uid: 'admin2', chatId: 2 }, staffBadge: 'admin',
    });
    const myModMsg = createMessage(3, '확인했습니다', {
      channel: 'local', author: '내운영자', now: at, from: { uid: 'me', chatId: 3 }, staffBadge: 'maintainer',
    });
    const otherModMsg = createMessage(4, '도와드릴게요', {
      channel: 'guild', author: '타운영자', now: at, from: { uid: 'mod', chatId: 4 }, staffBadge: 'maintainer',
    });
    const myNormalMsg = createMessage(5, '반갑습니다', {
      channel: 'local', author: '내일반어부', now: at, from: { uid: 'me', chatId: 5 },
    });
    const otherNormalMsg = createMessage(6, '안녕하세요', {
      channel: 'local', author: '일반어부', now: at, from: { uid: 'user', chatId: 6 },
    });

    render(
      <MessageLog
        log={[myAdminMsg, otherAdminMsg, myModMsg, otherModMsg, myNormalMsg, otherNormalMsg]}
        you="me"
        onPick={() => {}}
      />,
    );
    const lines = [...screen.getByRole('log').children];

    // 관리자(mine: true, local): 큰 별과 닉네임 버튼 모두 text-staff, 본문은 text-text
    const myAdminBtn = within(lines[0] as HTMLElement).getByRole('button', { name: '내관리자' });
    const myAdminIcon = lines[0].querySelector('svg[data-glyph="staffStarLarge"]');
    expect(myAdminIcon).not.toBeNull();
    expect(myAdminIcon).toHaveClass('text-staff');
    expect(myAdminIcon?.nextElementSibling).toBe(myAdminBtn);
    expect(myAdminBtn).toHaveClass('text-staff');
    expect(lines[0]).toHaveClass('text-text');

    // 관리자(mine: false, local): 큰 별과 닉네임 버튼 모두 text-staff
    const otherAdminBtn = within(lines[1] as HTMLElement).getByRole('button', { name: '타관리자' });
    const otherAdminIcon = lines[1].querySelector('svg[data-glyph="staffStarLarge"]');
    expect(otherAdminIcon).toHaveClass('text-staff');
    expect(otherAdminBtn).toHaveClass('text-staff');

    // 운영자(mine: true, local): 작은 별과 닉네임 버튼 모두 text-staff
    const myModBtn = within(lines[2] as HTMLElement).getByRole('button', { name: '내운영자' });
    const myModIcon = lines[2].querySelector('svg[data-glyph="staffStarSmall"]');
    expect(myModIcon).toHaveClass('text-staff');
    expect(myModBtn).toHaveClass('text-staff');

    // 운영자(mine: false, guild): 작은 별과 닉네임 버튼 모두 text-staff, 본문은 text-guild
    const otherModBtn = within(lines[3] as HTMLElement).getByRole('button', { name: '타운영자' });
    const otherModIcon = lines[3].querySelector('svg[data-glyph="staffStarSmall"]');
    expect(otherModIcon).not.toBeNull();
    expect(otherModIcon).toHaveClass('text-staff');
    expect(otherModIcon?.nextElementSibling).toBe(otherModBtn);
    expect(otherModBtn).toHaveClass('text-staff');
    expect(lines[3]).toHaveClass('text-guild');

    // 일반 플레이어(mine: true / mine: false): 별 아이콘·유니코드 별 없고 각각 text-gold / text-accent 유지
    const myNormalBtn = within(lines[4] as HTMLElement).getByRole('button', { name: '내일반어부' });
    expect(lines[4].querySelector('svg')).toBeNull();
    expect(myNormalBtn).toHaveClass('text-gold');

    const otherNormalBtn = within(lines[5] as HTMLElement).getByRole('button', { name: '일반어부' });
    expect(lines[5].querySelector('svg')).toBeNull();
    expect(lines[5].textContent).not.toMatch(/[★☆]/);
    expect(otherNormalBtn).toHaveClass('text-accent');
    expect(lines[5]).toHaveClass('text-text');
  });
});
