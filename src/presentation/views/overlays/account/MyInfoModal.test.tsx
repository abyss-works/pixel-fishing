import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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
  it('게스트는 닉네임 입력과 변경 버튼이 공용 잠금이라 눌러도 바꾸지 않고 이유를 툴팁으로 보인다', () => {
    const { onRename, baseElement } = open(null);
    expect((screen.getByLabelText('새 닉네임') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '변경' }) as HTMLButtonElement).disabled).toBe(true);
    expect(baseElement.querySelector('[title]')).toBeNull();
    const group = screen.getByRole('group', { name: '닉네임 변경' });
    expect(group.querySelector('[data-glyph="lock"]')).not.toBeNull();
    fireEvent.mouseEnter(group.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('태평양 항로가 열리면 쓸 수 있어요.');
    fireEvent.click(group);
    fireEvent.click(screen.getByRole('button', { name: '변경' }));
    expect(onRename).not.toHaveBeenCalled();
  });

  it('계정을 연결한 사용자는 닉네임을 바꾼다', () => {
    const { onRename } = open('me@example.com');
    expect(screen.queryByRole('group', { name: '닉네임 변경' })).toBeNull();
    fireEvent.change(screen.getByLabelText('새 닉네임'), { target: { value: '고등어' } });
    fireEvent.click(screen.getByRole('button', { name: '변경' }));
    expect(onRename).toHaveBeenCalledWith('고등어');
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
    expect((screen.getByLabelText('새 닉네임') as HTMLInputElement).disabled).toBe(false);
  });
});

describe('MyInfoModal 비동기 상태 구분', () => {
  it('닉네임 상태에 따라 불러오는 중, 미설정, 불러오기 실패를 구분해 보인다', () => {
    const { rerender } = render(
      <MyInfoModal setToast={vi.fn()} onClose={vi.fn()} account="me@example.com" uid="u1" nickname={null} profileStatus="loading" onRename={vi.fn(async () => null)} />,
    );
    expect(screen.getByLabelText('현재 닉네임')).toHaveTextContent('불러오는 중');

    rerender(<MyInfoModal setToast={vi.fn()} onClose={vi.fn()} account="me@example.com" uid="u1" nickname={null} profileStatus="loaded" onRename={vi.fn(async () => null)} />);
    expect(screen.getByLabelText('현재 닉네임')).toHaveTextContent('미설정');

    rerender(<MyInfoModal setToast={vi.fn()} onClose={vi.fn()} account="me@example.com" uid="u1" nickname={null} profileStatus="error" onRename={vi.fn(async () => null)} />);
    expect(screen.getByLabelText('현재 닉네임')).toHaveTextContent('불러오기 실패');
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
