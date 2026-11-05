// 친구 창 — 닉네임을 치는 동안 후보를 보이고, 고르면 입력을 그 이름으로 채운다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import FriendsModal from './FriendsModal';

vi.mock('../../../../features/friends/service/useFriends', () => ({
  useFriends: () => ({ groups: { friends: [], incoming: [], outgoing: [] }, loading: false, failed: false, act: vi.fn() }),
}));
vi.mock('../../../../features/gameplay/service/useGameTime', () => ({ useNow: () => '2026-11-05T00:00:00.000Z' }));
vi.mock('../../../../features/friends/service/useNicknameSuggestions', () => ({
  useNicknameSuggestions: (text: string) => (text.trim() === ''
    ? []
    : [{ uid: 'a', nickname: '갈치' }, { uid: 'b', nickname: '갈매기' }].filter(p => p.nickname.startsWith(text.trim()))),
}));

describe('FriendsModal 닉네임 후보', () => {
  afterEach(cleanup);

  it('치는 동안 후보를 보이고, 고르면 입력을 채우며 같은 이름의 후보는 숨긴다', () => {
    render(<FriendsModal setToast={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByLabelText('친구 닉네임') as HTMLInputElement;
    expect(screen.queryByLabelText('닉네임 후보')).toBeNull();
    fireEvent.change(input, { target: { value: '갈' } });
    const list = screen.getByLabelText('닉네임 후보');
    expect(within(list).getAllByRole('option').map(b => b.textContent)).toEqual(['갈치', '갈매기']);
    fireEvent.click(within(list).getByRole('option', { name: '갈치' }));
    expect(input.value).toBe('갈치');
    expect(screen.queryByLabelText('닉네임 후보')).toBeNull();
  });
});
