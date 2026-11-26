import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GuildInvitePreview } from '../../../../features/guild/model/guild';
import GuildInviteDialog from './GuildInviteDialog';

const state = vi.hoisted(() => ({
  preview: null as GuildInvitePreview | null,
  settled: false,
  failed: false,
  loading: false,
  inviteRefresh: vi.fn(),
  guild: null as { name: string } | null,
  guildLoading: false,
  guildFailed: false,
  guildRefresh: vi.fn(),
  act: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock('../../../../features/guild/service/useGuildInvite', () => ({
  useGuildInvite: () => ({
    preview: state.preview,
    settled: state.settled,
    failed: state.failed,
    loading: state.loading,
    refresh: state.inviteRefresh,
  }),
}));

vi.mock('../../../../features/guild/service/useGuild', () => ({
  useGuild: () => ({
    guild: state.guild,
    loading: state.guildLoading,
    failed: state.guildFailed,
    refresh: state.guildRefresh,
    act: state.act,
  }),
}));

afterEach(() => {
  cleanup();
  state.preview = null;
  state.settled = false;
  state.failed = false;
  state.loading = false;
  state.guild = null;
  state.guildLoading = false;
  state.guildFailed = false;
  vi.clearAllMocks();
});

describe('GuildInviteDialog 비동기 상태 구분', () => {
  it('초대 또는 길드 조회 중일 때만 불러오는 중을 보이고, 실패 시 오류 문구를 보인다', () => {
    state.loading = true;
    const { rerender } = render(
      <GuildInviteDialog code="K7QX2MAB" account="u@example.com" onAccount={vi.fn()} onClose={vi.fn()} setToast={vi.fn()} />,
    );
    expect(screen.getByText('초대를 불러오는 중이에요.')).toBeTruthy();

    state.loading = false;
    state.failed = true;
    rerender(<GuildInviteDialog code="K7QX2MAB" account="u@example.com" onAccount={vi.fn()} onClose={vi.fn()} setToast={vi.fn()} />);
    expect(screen.getByText('길드 초대 정보를 열지 못했어요.')).toBeTruthy();
    expect(screen.queryByText('초대를 불러오는 중이에요.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(state.inviteRefresh).toHaveBeenCalledTimes(1);

    state.failed = false;
    state.settled = true;
    state.preview = { code: 'K7QX2MAB', name: '새벽선단', level: 3, members: 4, cap: 10, joinMode: 'open' };
    state.guildFailed = true;
    rerender(<GuildInviteDialog code="K7QX2MAB" account="u@example.com" onAccount={vi.fn()} onClose={vi.fn()} setToast={vi.fn()} />);
    expect(screen.getByText('길드 초대 정보를 열지 못했어요.')).toBeTruthy();
    expect(screen.queryByText('초대를 불러오는 중이에요.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(state.guildRefresh).toHaveBeenCalledTimes(1);
  });
});
