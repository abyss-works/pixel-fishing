import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { newState } from '../../../../../game/rules/logic';
import type { ProfileStatus } from '../../../../../features/gameplay/service/types';
import SettingsTab from './SettingsTab';

afterEach(cleanup);

function renderSettings(nickname: string | null, profileStatus: ProfileStatus) {
  return render(
    <SettingsTab
      autoLockOnCatch={newState().autoLockOnCatch}
      dispatch={vi.fn(() => ({ status: 'ok' as const, state: newState(), result: { type: 'none' as const } }))}
      setToast={vi.fn()}
      syncLabel={null}
      syncState="on"
      account="u@example.com"
      accountFailed={false}
      uid="u1"
      onAuthChanged={async () => {}}
      nickname={nickname}
      profileStatus={profileStatus}
      onRename={async () => null}
    />,
  );
}

describe('SettingsTab 닉네임 비동기 상태 구분', () => {
  it('loading, error, loaded+null, 정상 닉네임을 구분해 보인다', () => {
    const { rerender } = renderSettings(null, 'loading');
    expect(screen.getByText('불러오는 중')).toBeInTheDocument();

    rerender(
      <SettingsTab
        autoLockOnCatch={newState().autoLockOnCatch}
        dispatch={vi.fn(() => ({ status: 'ok' as const, state: newState(), result: { type: 'none' as const } }))}
        setToast={vi.fn()}
        syncLabel={null}
        syncState="on"
        account="u@example.com"
        accountFailed={false}
        uid="u1"
        onAuthChanged={async () => {}}
        nickname={null}
        profileStatus="loaded"
        onRename={async () => null}
      />,
    );
    expect(screen.getByText('미설정')).toBeInTheDocument();

    rerender(
      <SettingsTab
        autoLockOnCatch={newState().autoLockOnCatch}
        dispatch={vi.fn(() => ({ status: 'ok' as const, state: newState(), result: { type: 'none' as const } }))}
        setToast={vi.fn()}
        syncLabel={null}
        syncState="on"
        account="u@example.com"
        accountFailed={false}
        uid="u1"
        onAuthChanged={async () => {}}
        nickname={null}
        profileStatus="error"
        onRename={async () => null}
      />,
    );
    expect(screen.getByText('불러오기 실패')).toBeInTheDocument();

    rerender(
      <SettingsTab
        autoLockOnCatch={newState().autoLockOnCatch}
        dispatch={vi.fn(() => ({ status: 'ok' as const, state: newState(), result: { type: 'none' as const } }))}
        setToast={vi.fn()}
        syncLabel={null}
        syncState="on"
        account="u@example.com"
        accountFailed={false}
        uid="u1"
        onAuthChanged={async () => {}}
        nickname="바다사나이"
        profileStatus="loaded"
        onRename={async () => null}
      />,
    );
    expect(screen.getByText('바다사나이')).toBeInTheDocument();
  });

  it('계정 관리 버튼은 기존 계정 관리 창(로그아웃·계정 삭제 포함)을 연다', () => {
    renderSettings('바다사나이', 'loaded');
    fireEvent.click(screen.getByRole('button', { name: '계정 관리' }));
    expect(screen.getByRole('dialog', { name: '계정 관리' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계정 삭제' })).toBeInTheDocument();
  });
});
