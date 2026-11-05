// 소셜 창: 친구, 요청, 차단 세 탭. 친구 표의 있는 곳 칸, 요청 탭의 닉네임 후보와 받은 요청 처리, 차단 해제.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FriendItem } from '../../../../features/friends/model/friends';
import FriendsModal from './FriendsModal';

const s = vi.hoisted(() => ({
  groups: { friends: [], incoming: [], outgoing: [] } as { friends: FriendItem[]; incoming: FriendItem[]; outgoing: FriendItem[] },
  act: vi.fn(async () => ({ ok: true, result: 'accepted' })),
}));
vi.mock('../../../../features/friends/service/useFriends', () => ({
  useFriends: () => ({ groups: s.groups, loading: false, failed: false, act: s.act }),
}));
const moderation = vi.hoisted(() => ({ unblock: vi.fn(async () => null) }));
vi.mock('../../../../features/live/service/useChatModeration', () => ({
  useChatModeration: () => ({ blocks: [{ uid: 'b1', nick: '무례' }], ...moderation }),
}));
vi.mock('../../../../features/gameplay/service/useGameTime', () => ({ useNow: () => '2026-11-05T00:00:00.000Z' }));
vi.mock('../../../../features/friends/service/useNicknameSuggestions', () => ({
  useNicknameSuggestions: (text: string) => (text.trim() === ''
    ? []
    : [{ uid: 'a', nickname: '갈치' }, { uid: 'b', nickname: '갈매기' }].filter(p => p.nickname.startsWith(text.trim()))),
}));

const person = (uid: string, state: FriendItem['state'], extra: Partial<FriendItem> = {}): FriendItem =>
  ({ uid, nick: uid, state, lastActiveAt: null, online: false, region: null, zone: null, ...extra });

describe('FriendsModal(소셜 창)', () => {
  afterEach(() => {
    cleanup();
    s.groups = { friends: [], incoming: [], outgoing: [] };
    vi.clearAllMocks();
  });

  it('친구 탭은 친구 수를 탭 이름에 붙이고, 있는 곳 칸에 접속 중이면 바다를, 아니면 지난 시간을 쓴다', () => {
    s.groups = {
      friends: [
        person('바다사나이', 'friend', { online: true, region: 'village' }),
        person('물안개', 'friend', { lastActiveAt: '2026-11-04T21:00:00.000Z' }),
      ],
      incoming: [], outgoing: [],
    };
    render(<FriendsModal setToast={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: '친구 2' })).toBeTruthy();
    expect(within(screen.getByText('바다사나이').closest('tr')!).getByText('마을')).toBeTruthy();
    expect(within(screen.getByText('물안개').closest('tr')!).getByText('3시간 전')).toBeTruthy();
    expect(screen.queryByText(/접속 중 ·/)).toBeNull();
  });

  it('요청 탭은 받은 요청 수를 탭에 붙이고, 받은 요청을 수락한다', async () => {
    s.groups = { friends: [], incoming: [person('바다거북', 'incoming')], outgoing: [person('노을어부', 'outgoing')] };
    const setToast = vi.fn();
    render(<FriendsModal setToast={setToast} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /요청/ }));
    const incoming = screen.getByRole('region', { name: '받은 요청' });
    fireEvent.click(within(incoming).getByRole('button', { name: '수락' }));
    expect(s.act).toHaveBeenCalledWith({ op: 'accept', uid: '바다거북' });
    await waitFor(() => expect(setToast).toHaveBeenCalledWith('바다거북 님과 친구가 됐어요.'));
    expect(within(screen.getByRole('region', { name: '보낸 요청' })).getByRole('button', { name: '취소' })).toBeTruthy();
  });

  it('요청 탭에서 치는 동안 후보를 보이고, 고르면 입력을 채우며 같은 이름의 후보는 숨긴다', () => {
    render(<FriendsModal setToast={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '요청' }));
    expect(screen.getByText('받은 요청이 없어요.')).toBeTruthy();
    const input = screen.getByLabelText('친구 닉네임') as HTMLInputElement;
    expect(screen.queryByLabelText('닉네임 후보')).toBeNull();
    fireEvent.change(input, { target: { value: '갈' } });
    const list = screen.getByLabelText('닉네임 후보');
    expect(within(list).getAllByRole('option').map(b => b.textContent)).toEqual(['갈치', '갈매기']);
    fireEvent.click(within(list).getByRole('option', { name: '갈치' }));
    expect(input.value).toBe('갈치');
    expect(screen.queryByLabelText('닉네임 후보')).toBeNull();
  });

  it('차단 탭에서 차단한 사람을 보고 해제한다', async () => {
    const setToast = vi.fn();
    render(<FriendsModal setToast={setToast} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '차단' }));
    expect(screen.getByText('무례')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '해제' }));
    await waitFor(() => expect(setToast).toHaveBeenCalledWith('무례 님의 차단을 풀었어요.', undefined));
    expect(moderation.unblock).toHaveBeenCalledWith('b1');
  });
});
