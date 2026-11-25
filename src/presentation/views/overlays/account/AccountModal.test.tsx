// 계정 관리 창의 동작 계약 - 게스트의 구글 연결 시작, 계정 사용자 구성, 계정 확인 실패 처리.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const actions = vi.hoisted(() => ({
  connectGoogle: vi.fn(),
  configured: true,
}));

vi.mock('../../../../features/account/service/accountActions', async importOriginal => ({
  ...await importOriginal<object>(),
  isAccountConfigured: () => actions.configured,
  connectGoogle: actions.connectGoogle,
}));

import AccountModal from './AccountModal';
import { ACCOUNT_CHECK_FAILED_COPY } from '../../../../features/account/model/accountRules';
import { hasPendingSailReturn, resetSailReturnForTest, setPendingSailReturn } from '../../../../features/account/service/sailReturn';

beforeEach(() => {
  actions.connectGoogle.mockReset();
  actions.connectGoogle.mockResolvedValue({ ok: true });
  actions.configured = true;
  sessionStorage.clear();
  resetSailReturnForTest();
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  resetSailReturnForTest();
});

const open = (
  account: string | null,
  accountFailed = false,
  sailReturn = false,
  mode: 'manage' | 'connect' = 'manage',
) => {
  const setToast = vi.fn();
  const onAuthChanged = vi.fn(async () => {});
  const onClose = vi.fn();
  const view = render(
    <AccountModal layer={mode === 'connect' ? 'stage' : 'app'} mode={mode} setToast={setToast} onAuthChanged={onAuthChanged} onClose={onClose}
                  account={account} accountFailed={accountFailed} sailReturn={sailReturn} syncLabel="진행 저장 켜짐" syncState="on" />,
  );
  return { setToast, onAuthChanged, onClose, unmount: view.unmount };
};

describe('게스트의 구글 연결', () => {
  it('구글 버튼은 연결을 시작하고 이메일 로그인 폼은 없다', async () => {
    open(null);
    expect(screen.queryByRole('button', { name: '기존 이메일 계정으로 로그인' })).toBeNull();
    expect(screen.queryByLabelText('이메일')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(1));
  });

  it('시작하지 못하면 경고하고 버튼을 다시 쓸 수 있다', async () => {
    actions.connectGoogle.mockResolvedValue({ ok: false, msg: '실패' });
    const { setToast } = open(null);
    const button = screen.getByRole('button', { name: 'Google로 계속하기' });
    fireEvent.click(button);
    await waitFor(() => expect(setToast).toHaveBeenCalledWith('구글 계정 선택 화면을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'warn'));
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('고지 한 줄에 이용약관과 개인정보 처리방침 링크가 있다', () => {
    open(null);
    expect(screen.getByRole('link', { name: '이용약관' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute('target', '_blank');
  });
});

describe('로그인 상태별 구성', () => {
  it('구글 계정 사용자는 구글 버튼 없이 로그아웃과 약관·처리방침·운영정책 링크가 있다', () => {
    open('me@gmail.test');
    expect(screen.queryByRole('button', { name: 'Google로 계속하기' })).toBeNull();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    for (const [name, href] of [['이용약관', '/terms'], ['개인정보 처리방침', '/privacy'], ['운영정책', '/policy']]) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
    }
  });

  it('게임 서버가 없는 로컬 모드에서는 안내가 보이고 계정 동작 버튼이 비활성이다', () => {
    actions.configured = false;
    open('dev@localhost');
    expect(screen.getByText(/오프라인 상태에서는 계정 기능이 동작하지 않아요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '계정 삭제' })).toBeDisabled();
  });
});

describe('계정 확인 실패', () => {
  it('게스트 화면 대신 확인 실패 안내와 다시 확인 버튼만 보이고, 계정 변경 동작은 없다', () => {
    open(null, true);
    expect(screen.getByText(ACCOUNT_CHECK_FAILED_COPY.label)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ACCOUNT_CHECK_FAILED_COPY.retry })).toBeInTheDocument();
    expect(screen.queryByText('게스트')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Google로 계속하기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull();
    expect(screen.queryByRole('button', { name: '계정 삭제' })).toBeNull();
    expect(screen.queryByText('이용약관')).toBeNull();
    expect(screen.queryByText('개인정보 처리방침')).toBeNull();
  });

  it('다시 확인을 누르면 계정 확인을 새로 요청한다', async () => {
    const { onAuthChanged } = open(null, true);
    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_CHECK_FAILED_COPY.retry }));
    await waitFor(() => expect(onAuthChanged).toHaveBeenCalledTimes(1));
  });

  it('다시 확인하는 동안에는 버튼이 눌리지 않는다', async () => {
    let release = () => {};
    const view = open(null, true);
    view.onAuthChanged.mockImplementation(() => new Promise<void>(r => { release = r; }));
    const button = screen.getByRole('button', { name: ACCOUNT_CHECK_FAILED_COPY.retry });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    release();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('layer="stage"에서 확인 대화상자는 ModalCard 바깥 형제로 마운트돼 스테이지 전체를 덮는다', async () => {
    render(
      <div data-testid="stage">
        <AccountModal layer="stage" setToast={vi.fn()} onAuthChanged={vi.fn(async () => {})} onClose={vi.fn()}
                      account={null} accountFailed={false} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: '계정 삭제' }));

    const accountDialog = screen.getByRole('dialog', { name: '계정 관리' });
    const deleteDialog = await screen.findByRole('dialog', { name: '계정 삭제' });
    const stage = screen.getByTestId('stage');
    expect(accountDialog).not.toBe(deleteDialog);
    expect(accountDialog.contains(deleteDialog)).toBe(false);
    expect(stage).toContainElement(deleteDialog);
  });
});

describe('출항 차단 후 로그인 의도 표지', () => {
  it('출항 의도로 열린 창에서 구글 로그인을 시작하면 출항 대기를 저장한다', async () => {
    open(null, false, true);
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(1));
    expect(hasPendingSailReturn()).toBe(true);
  });

  it('출항 의도로 열린 창에서 구글 로그인 시작이 실패하면 출항 대기를 지운다', async () => {
    actions.connectGoogle.mockResolvedValue({ ok: false, msg: '실패' });
    open(null, false, true);
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hasPendingSailReturn()).toBe(false));
  });

  it('출항 의도로 열린 창을 로그인 없이 닫으면 출항 대기를 지우고 닫는다', () => {
    setPendingSailReturn();
    const { onClose } = open(null, false, true);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hasPendingSailReturn()).toBe(false);
  });

  it('일반 계정 관리 창(설정 등)에서는 구글 로그인을 눌러도 출항 대기를 저장하지 않는다', async () => {
    open(null, false, false);
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(1));
    expect(hasPendingSailReturn()).toBe(false);
  });
});

describe('출항 전용 연결 창 (mode="connect")', () => {
  it('게스트 상태에서는 출항 안내와 해금 3항목, 구글 버튼, 약관 고지, 나중에 하기만 보이고 계정 삭제·상태 박스는 없다', () => {
    open(null, false, true, 'connect');
    expect(screen.getByRole('dialog', { name: '태평양 출항 준비' })).toBeInTheDocument();
    expect(screen.getByText('태평양 너머 넓은 바다로 나갈 준비가 되었어요.')).toBeInTheDocument();
    expect(screen.getByText('태평양과 세계 해역 개방')).toBeInTheDocument();
    expect(screen.getByText('업적 보상과 소셜 기능 해금')).toBeInTheDocument();
    expect(screen.getByText('현재 마을 진행 그대로 유지')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '이용약관' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: '나중에 하기' })).toBeInTheDocument();

    expect(screen.queryByText('게스트')).toBeNull();
    expect(screen.queryByText('진행 저장 켜짐')).toBeNull();
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull();
    expect(screen.queryByRole('button', { name: '계정 삭제' })).toBeNull();
    expect(screen.queryByRole('link', { name: '운영정책' })).toBeNull();
  });

  it('나중에 하기를 누르면 출항 대기를 지우고 창을 닫는다', () => {
    setPendingSailReturn();
    const { onClose } = open(null, false, true, 'connect');
    fireEvent.click(screen.getByRole('button', { name: '나중에 하기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hasPendingSailReturn()).toBe(false);
  });

  it('연결 창에서 구글 로그인을 시작하면 sailReturn 표지를 저장한다', async () => {
    open(null, false, true, 'connect');
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledTimes(1));
    expect(hasPendingSailReturn()).toBe(true);
  });

  it('세션 확인 실패 상태에서는 출항 전용 창에서도 확인 실패 안내와 다시 확인 버튼만 둔다', () => {
    open(null, true, false, 'connect');
    expect(screen.getByRole('dialog', { name: '태평양 출항 준비' })).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_CHECK_FAILED_COPY.label)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ACCOUNT_CHECK_FAILED_COPY.retry })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Google로 계속하기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '나중에 하기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '계정 삭제' })).toBeNull();
  });
});
