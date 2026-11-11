// 플레이어 정보: 공개 프로필(명성, 도감, 배, 낚싯대, 유물)과 계정 유저가 쓰는 친구 요청, 차단, 신고.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ARTIFACTS } from '../../../../game/content/artifacts';
import { FISH } from '../../../../game/content/fish';
import { PlayerInfo } from './PlayerInfo';

const s = vi.hoisted(() => ({
  relation: null as null | 'friend' | 'incoming' | 'outgoing',
  blocked: false as boolean | null,
  act: vi.fn(async () => ({ ok: true, result: 'requested' })),
  block: vi.fn(async () => null),
  report: vi.fn(async () => null),
}));

vi.mock('../../../../features/live/service/usePlayerProfile', () => ({
  usePlayerProfile: () => ({ profile: {
    nickname: '갈치', boat: 2, rod: 7, fame: 12345, dexFish: ['crucian', 'minnow'], artifacts: ['abyss-angler'], account: true,
  }, loading: false, failed: false }),
}));
vi.mock('../../../../features/friends/service/useFriends', () => ({
  useFriends: () => ({ groups: { friends: [], incoming: [], outgoing: [] }, offline: false, act: s.act }),
}));
vi.mock('../../../../features/friends/model/friends', async importOriginal => ({
  ...await importOriginal<object>(),
  friendRelation: () => s.relation,
}));
vi.mock('../../../../features/live/service/useChatModeration', () => ({
  useChatModeration: () => ({ isBlocked: () => s.blocked, block: s.block, unblock: vi.fn(), report: s.report }),
}));

const target = { uid: 'u1', nick: '갈치', chatId: 9 };
const show = (over: Partial<Parameters<typeof PlayerInfo>[0]> = {}) =>
  render(<PlayerInfo target={target} self={false} account="me@example.com" setToast={vi.fn()} {...over} />);

describe('PlayerInfo', () => {
  afterEach(() => { cleanup(); s.relation = null; s.blocked = false; vi.clearAllMocks(); });

  it('명성·도감·낚싯대·가진 유물을 보이고, 친구 요청·차단·신고를 보낸다', async () => {
    show();
    expect(screen.getByText('12,345')).toBeTruthy();
    expect(screen.getByText('2 / ' + FISH.length)).toBeTruthy();
    expect(screen.getByText('Lv.7')).toBeTruthy();
    expect(screen.getByLabelText('유물 해구의 이빨')).toBeTruthy();
    expect(screen.getAllByLabelText(/유물 없음$/)).toHaveLength(ARTIFACTS.length - 1);
    fireEvent.click(screen.getByRole('button', { name: '친구 요청' }));
    expect(s.act).toHaveBeenCalledWith({ op: 'request', nickname: '갈치' });
    const blockButton = screen.getByRole('button', { name: '차단' }) as HTMLButtonElement;
    await waitFor(() => expect(blockButton.disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '이 채팅 신고' }));
    expect(s.report).toHaveBeenCalledWith(9);
    expect(await screen.findByRole('button', { name: '신고함' })).toBeTruthy();
    await waitFor(() => expect(blockButton.disabled).toBe(false));
    fireEvent.click(blockButton);
    expect(s.block).toHaveBeenCalledWith('u1');
  });

  it('친구이거나 요청 중이면 요청 버튼 대신 상태를 보이고, 차단했으면 해제를 보인다', () => {
    s.relation = 'outgoing';
    s.blocked = true;
    show({ target: { uid: 'u1', nick: '갈치' } });
    expect(screen.queryByRole('button', { name: '친구 요청' })).toBeNull();
    expect(screen.getByRole('button', { name: '차단 해제' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '이 채팅 신고' })).toBeNull();
    cleanup();
    s.blocked = false;
    show();
    expect(screen.getByText('친구 요청을 보냈어요')).toBeTruthy();
  });

  it('게스트에게는 친구 요청과 차단을 공용 잠금으로 두고 이유를 툴팁으로 보인다. 누르면 아무 일도 없다', () => {
    const { container } = show({ account: null });
    const buttons = screen.getAllByRole('button', { name: /^(친구 요청|차단)$/ }) as HTMLButtonElement[];
    expect(buttons.map(b => [b.textContent, b.disabled])).toEqual([['친구 요청', true], ['차단', true]]);
    expect(container.querySelectorAll('[data-glyph="lock"]')).toHaveLength(2);
    expect(container.querySelector('[title]')).toBeNull();
    const groups = screen.getAllByRole('group');
    fireEvent.mouseEnter(groups[0].parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('계정을 연결하면 쓸 수 있어요.');
    fireEvent.mouseLeave(groups[0].parentElement!);
    groups.forEach(g => fireEvent.click(g));
    buttons.forEach(b => fireEvent.click(b));
    expect(s.act).not.toHaveBeenCalled();
    expect(s.block).not.toHaveBeenCalled();
  });

  it('내 정보에는 동작이 없다', () => {
    show({ self: true });
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});
