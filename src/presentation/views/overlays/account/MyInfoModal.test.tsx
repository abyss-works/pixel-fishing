import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const accounts = vi.hoisted(() => ({ configured: true }));
vi.mock('../../../../features/account/service/accountActions', async importOriginal => ({
  ...await importOriginal<object>(),
  isAccountConfigured: () => accounts.configured,
  isGuest: (account: string | null) => account === null && accounts.configured,
  accountLockState: (account: string | null, accountFailed: boolean) =>
    accountFailed ? 'unverified' : account === null && accounts.configured ? 'guest' : 'account',
}));

import MyInfoModal from './MyInfoModal';

afterEach(() => { cleanup(); accounts.configured = true; });

const open = (account: string | null, accountFailed = false) => {
  const onRename = vi.fn(async () => null);
  const view = render(<MyInfoModal setToast={vi.fn()} onClose={vi.fn()}
    account={account} accountFailed={accountFailed} uid="u1" nickname="배부른_참치" onRename={onRename} />);
  return { onRename, ...view };
};

describe('MyInfoModal 닉네임 변경 잠금', () => {
  it('게스트는 기본 1줄 상태에서 닉네임 입력과 변경 버튼이 비활성이고 외부 자물쇠 아이콘 없이 공용 잠금 툴팁만 보인다', () => {
    const { onRename, baseElement } = open(null);
    const currentInput = screen.getByLabelText('현재 닉네임') as HTMLInputElement;
    expect(currentInput.disabled).toBe(true);
    expect(currentInput.value).toBe('배부른_참치');
    expect((screen.getByRole('button', { name: '변경' }) as HTMLButtonElement).disabled).toBe(true);
    expect(baseElement.querySelector('[title]')).toBeNull();
    expect(baseElement.querySelector('[data-glyph="lock"]')).toBeNull();
    const group = screen.getByRole('group', { name: '닉네임 변경' });
    fireEvent.mouseEnter(group.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('태평양 항로가 열리면 쓸 수 있어요.');
    fireEvent.click(group);
    fireEvent.click(screen.getByRole('button', { name: '변경' }));
    expect(screen.queryByLabelText('새 닉네임')).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('계정을 연결한 사용자는 변경을 눌러 1줄 인라인 편집으로 전환하고 확인 후 기본 상태로 돌아간다', async () => {
    const { onRename } = open('me@example.com');
    expect(screen.queryByRole('group', { name: '닉네임 변경' })).toBeNull();
    const currentInput = screen.getByLabelText('현재 닉네임') as HTMLInputElement;
    expect(currentInput.disabled).toBe(true);
    expect(currentInput.value).toBe('배부른_참치');

    fireEvent.click(screen.getByRole('button', { name: '변경' }));
    const editInput = screen.getByLabelText('새 닉네임') as HTMLInputElement;
    expect(editInput.disabled).toBe(false);
    expect(document.activeElement).toBe(editInput);
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();

    fireEvent.change(editInput, { target: { value: '고등어' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onRename).toHaveBeenCalledWith('고등어');
    await waitFor(() => expect(screen.queryByLabelText('새 닉네임')).toBeNull());
    expect((screen.getByLabelText('현재 닉네임') as HTMLInputElement).disabled).toBe(true);
  });

  it('인라인 편집 중 취소나 Esc를 누르면 모달은 닫지 않고 편집 모드만 종료한다', () => {
    const onClose = vi.fn();
    const onRename = vi.fn(async () => null);
    render(
      <MyInfoModal setToast={vi.fn()} onClose={onClose} account="me@example.com" uid="u1" nickname="배부른_참치" onRename={onRename} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '변경' }));
    const editInput = screen.getByLabelText('새 닉네임');
    fireEvent.keyDown(editInput, { key: 'Escape' });
    expect(screen.queryByLabelText('새 닉네임')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '변경' }));
    const cancelBtn = screen.getByRole('button', { name: '취소' });
    cancelBtn.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('새 닉네임')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '변경' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByLabelText('새 닉네임')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('확인 실패 상태에서는 닉네임 변경 잠금 툴팁에 확인 실패 문안을 보인다', () => {
    open(null, true);
    const group = screen.getByRole('group', { name: '닉네임 변경' });
    fireEvent.mouseEnter(group.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('계정을 확인하면 쓸 수 있어요.');
  });

  it('계정을 연결할 곳이 없는 로컬 모드의 게스트는 잠그지 않는다', () => {
    accounts.configured = false;
    open(null);
    expect(screen.queryByRole('group', { name: '닉네임 변경' })).toBeNull();
    expect((screen.getByRole('button', { name: '변경' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '변경' }));
    expect((screen.getByLabelText('새 닉네임') as HTMLInputElement).disabled).toBe(false);
  });
});

describe('MyInfoModal 비동기 상태 구분', () => {
  it('닉네임 상태에 따라 불러오는 중, 미설정, 불러오기 실패를 구분해 보인다', () => {
    const { rerender } = render(
      <MyInfoModal setToast={vi.fn()} onClose={vi.fn()} account="me@example.com" uid="u1" nickname={null} profileStatus="loading" onRename={vi.fn(async () => null)} />,
    );
    expect(screen.getByLabelText('현재 닉네임')).toHaveValue('불러오는 중');

    rerender(<MyInfoModal setToast={vi.fn()} onClose={vi.fn()} account="me@example.com" uid="u1" nickname={null} profileStatus="loaded" onRename={vi.fn(async () => null)} />);
    expect(screen.getByLabelText('현재 닉네임')).toHaveValue('미설정');

    rerender(<MyInfoModal setToast={vi.fn()} onClose={vi.fn()} account="me@example.com" uid="u1" nickname={null} profileStatus="error" onRename={vi.fn(async () => null)} />);
    expect(screen.getByLabelText('현재 닉네임')).toHaveValue('불러오기 실패');
  });

  it('UID가 없을 때 세션 확인 중, 확인 실패, 비연결 게스트를 구분해 보인다', () => {
    const { rerender } = render(
      <MyInfoModal setToast={vi.fn()} onClose={vi.fn()} account={null} accountChecked={false} accountFailed={false} uid={null} nickname={null} profileStatus="loading" onRename={vi.fn(async () => null)} />,
    );
    expect(screen.getByText('연결 중')).toBeTruthy();

    rerender(
      <MyInfoModal setToast={vi.fn()} onClose={vi.fn()} account={null} accountChecked={false} accountFailed uid={null} nickname={null} profileStatus="error" onRename={vi.fn(async () => null)} />,
    );
    expect(screen.getByText('확인 실패')).toBeTruthy();

    rerender(
      <MyInfoModal setToast={vi.fn()} onClose={vi.fn()} account={null} accountChecked accountFailed={false} uid={null} nickname={null} profileStatus="loaded" onRename={vi.fn(async () => null)} />,
    );
    expect(screen.getByText('계정 연결 필요')).toBeTruthy();
  });

  it('닉네임 규칙과 ID 복사 안내는 바깥 본문에 늘려놓지 않고 각 소제목 툴팁으로 제공한다', () => {
    open('me@example.com');
    expect(screen.queryByText(/나중에 랭킹에 표시될 이름이에요/)).toBeNull();
    expect(screen.queryByText(/전체가 복사돼요/)).toBeNull();

    fireEvent.mouseEnter(screen.getByText('닉네임'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('한글은 8자, 영문과 숫자는 16자까지 쓸 수 있어요.');
    fireEvent.mouseLeave(screen.getByText('닉네임'));

    fireEvent.mouseEnter(screen.getByRole('heading', { name: '내 정보', level: 4 }).firstElementChild!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('복사를 누르면 전체가 복사돼요.');
  });
});
