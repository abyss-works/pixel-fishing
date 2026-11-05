// 길드 창 — 길드가 없으면 만들기·가입, 길드장에게는 초대 코드와 관리 동작, 길드원에게는 떠나기만 보인다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GuildInfo } from '../../../../features/guild/model/guild';
import GuildModal from './GuildModal';

const s = vi.hoisted(() => ({
  guild: null as GuildInfo | null,
  you: 'L',
  act: vi.fn(async (_op: unknown): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })),
}));
vi.mock('../../../../features/guild/service/useGuild', () => ({
  useGuild: () => ({ available: true, guild: s.guild, loading: false, failed: false, you: s.you, act: s.act }),
}));

const at = '2026-11-05T00:00:00.000Z';
const GUILD: GuildInfo = {
  id: 'g1', name: '심해선단', createdAt: at, role: 'leader',
  invite: { code: 'ABCD2345', expiresAt: '2999-01-01T00:00:00.000Z' },
  members: [
    { uid: 'L', nick: '가람', role: 'leader', joinedAt: at, leftAt: null, online: true },
    { uid: 'M', nick: '나루', role: 'member', joinedAt: at, leftAt: null, online: false },
    { uid: 'X', nick: '다온', role: 'member', joinedAt: at, leftAt: at, online: false },
  ],
};

describe('GuildModal', () => {
  afterEach(() => { cleanup(); s.guild = null; s.you = 'L'; vi.clearAllMocks(); });

  it('길드가 없으면 이름으로 만들고, 거부되면 이유를 보인다. 초대 코드로 들어갈 수 있다', async () => {
    const toast = vi.fn();
    render(<GuildModal setToast={toast} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('길드 이름'), { target: { value: ' 심해선단 ' } });
    fireEvent.click(screen.getByRole('button', { name: '만들기' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('심해선단 길드를 만들었어요.'));
    expect(s.act).toHaveBeenCalledWith({ op: 'create', name: '심해선단' });
    s.act.mockResolvedValueOnce({ ok: false, error: 'bad-code' });
    fireEvent.change(screen.getByLabelText('초대 코드'), { target: { value: 'abcd2345' } });
    fireEvent.click(screen.getByRole('button', { name: '들어가기' }));
    expect(await screen.findByText(/초대 코드를 찾지 못했어요/)).toBeTruthy();
    expect(s.act).toHaveBeenLastCalledWith({ op: 'join', code: 'abcd2345' });
  });

  it('길드장은 초대 코드와 위임·내보내기를 보고, 다른 길드원이 있으면 떠나기 대신 위임 안내를 본다', async () => {
    s.guild = GUILD;
    render(<GuildModal setToast={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('ABCD2345')).toBeTruthy();
    expect(screen.getByText('길드원 2/10명 · 나는 길드장이에요.')).toBeTruthy();
    expect(screen.getByText('다온')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '길드 떠나기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getAllByRole('button', { name: '내보내기' }).at(-1) as HTMLElement);
    await waitFor(() => expect(s.act).toHaveBeenCalledWith({ op: 'remove', guildId: 'g1', uid: 'M' }));
  });

  it('길드원은 관리 동작 없이 떠나기만 한다', () => {
    s.guild = { ...GUILD, role: 'member', invite: null };
    s.you = 'M';
    render(<GuildModal setToast={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('초대 코드')).toBeNull();
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '넘기기' })).toBeNull();
    expect(screen.getByRole('button', { name: '길드 떠나기' })).toBeTruthy();
  });
});
