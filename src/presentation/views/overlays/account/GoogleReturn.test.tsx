// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { resetKeyScopes } from '../../../ui/hotkeys';
import { resetOpenWindows } from '../../../ui/openWindows';

const auth = vi.hoisted(() => ({
  isConfigured: true,
  landing: null as { tag: string; error: string | null } | null,
  startGoogle: vi.fn(),
  confirmGoogleSwitch: vi.fn(),
  cancelGoogleSwitch: vi.fn(),
}));

vi.mock('../../../../platform/api', () => ({
  api: {
    auth: {
      get isConfigured() { return auth.isConfigured; },
      takeGoogleLanding: () => auth.landing,
      startGoogle: auth.startGoogle,
      confirmGoogleSwitch: auth.confirmGoogleSwitch,
      cancelGoogleSwitch: auth.cancelGoogleSwitch,
    },
  },
}));

import GoogleReturn from './GoogleReturn';

beforeEach(() => {
  auth.isConfigured = true;
  auth.landing = { tag: 'link-guest', error: 'account_already_linked_to_different_user' };
  auth.startGoogle.mockReset();
  auth.startGoogle.mockResolvedValue({ ok: true });
  auth.confirmGoogleSwitch.mockReset();
  auth.cancelGoogleSwitch.mockReset();
  auth.cancelGoogleSwitch.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  resetOpenWindows();
  resetKeyScopes();
});

describe('GoogleReturn 전환 잠금', () => {
  it('계정 전환을 누르면 confirmGoogleSwitch 실행 중 창을 닫지 않고 busy 잠금을 유지한 뒤 실패 시 닫는다', async () => {
    let resolveSwitch!: (value: { ok: false; fallback: false; msg: string; code: string }) => void;
    auth.confirmGoogleSwitch.mockReturnValue(
      new Promise(resolve => {
        resolveSwitch = resolve;
      }),
    );
    const setToast = vi.fn();
    render(<GoogleReturn setToast={setToast} progress="some" reopenAccount={vi.fn()} />);

    const dialog = await screen.findByRole('dialog', { name: '구글 계정으로 로그인' });
    const proceed = screen.getByRole('button', { name: '계정 전환' });
    const back = screen.getByRole('button', { name: '되돌아가기' });

    fireEvent.click(proceed);

    await waitFor(() => expect(auth.confirmGoogleSwitch).toHaveBeenCalledTimes(1));
    expect(dialog).toBeInTheDocument();
    expect(proceed).toBeDisabled();
    expect(back).toBeDisabled();
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '구글 계정으로 로그인' })).toBeInTheDocument();

    resolveSwitch({ ok: false, fallback: false, msg: '실패', code: 'server' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '구글 계정으로 로그인' })).toBeNull());
    expect(setToast).toHaveBeenCalledWith('선택한 구글 계정으로 전환하지 못했어요.\n잠시 뒤 다시 시도해 주세요.', 'warn');
  });
});
