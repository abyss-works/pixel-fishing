// 플레이어 정보 — 공개 프로필 네 항목과, 계정 유저에게만 보이는 친구 요청·차단·신고.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlayerInfo } from './PlayerInfo';

const s = vi.hoisted(() => ({
  relation: null as null | 'friend' | 'incoming' | 'outgoing',
  blocked: false as boolean | null,
  act: vi.fn(async () => ({ ok: true, result: 'requested' })),
  block: vi.fn(async () => null),
  report: vi.fn(async () => null),
}));

vi.mock('../../../../features/live/service/usePlayerProfile', () => ({
  usePlayerProfile: () => ({ profile: { nickname: '갈치', boat: 2, fame: 12345, dex: 7, account: true }, loading: false, failed: false }),
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

  it('닉네임·배·명성·도감 수를 보이고, 친구 요청·차단·신고를 보낸다', async () => {
    show();
    expect(screen.getByText('12,345')).toBeTruthy();
    expect(screen.getByText('7종')).toBeTruthy();
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

  it('게스트와 내 정보에는 동작이 없다', () => {
    show({ account: null });
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.getByText(/계정을 만든 뒤/)).toBeTruthy();
    cleanup();
    show({ self: true });
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});
