// 계정 관리 창의 동작 계약 - 게스트의 구글 연결 시작, 게스트가 이메일 계정으로 로그인하기 전의 확인, 로그인 방식별 구성.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const actions = vi.hoisted(() => ({
  connectGoogle: vi.fn(),
  signInAccount: vi.fn(),
  method: 'guest' as 'guest' | 'email' | 'google' | null,
  failed: false,
  configured: true,
  retry: vi.fn(),
}));

vi.mock('../../../../features/account/service/accountActions', async importOriginal => ({
  ...await importOriginal<object>(),
  isAccountConfigured: () => actions.configured,
  connectGoogle: actions.connectGoogle,
  signInAccount: actions.signInAccount,
}));
vi.mock('../../../../features/account/service/useLoginMethod', () => ({
  useLoginMethod: () => ({ method: actions.method, failed: actions.failed, retry: actions.retry }),
}));

import AccountModal from './AccountModal';

beforeEach(() => {
  actions.connectGoogle.mockReset();
  actions.connectGoogle.mockResolvedValue({ ok: true });
  actions.signInAccount.mockReset();
  actions.signInAccount.mockResolvedValue({ ok: true });
  actions.failed = false;
  actions.configured = true;
  actions.retry.mockReset();
});
afterEach(cleanup);

const open = (account: string | null, method: typeof actions.method) => {
  actions.method = method;
  const setToast = vi.fn();
  const onAuthChanged = vi.fn(async () => {});
  const onClose = vi.fn();
  render(<AccountModal setToast={setToast} onAuthChanged={onAuthChanged} onClose={onClose} account={account} />);
  return { setToast, onAuthChanged, onClose };
};

describe('게스트의 구글 연결', () => {
  it('구글 버튼은 게스트 표지로 연결을 시작한다', async () => {
    open(null, 'guest');
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledWith('guest'));
  });

  it('시작하지 못하면 경고하고 버튼을 다시 쓸 수 있다', async () => {
    actions.connectGoogle.mockResolvedValue({ ok: false, msg: '실패' });
    const { setToast } = open(null, 'guest');
    const button = screen.getByRole('button', { name: 'Google로 계속하기' });
    fireEvent.click(button);
    await waitFor(() => expect(setToast).toHaveBeenCalledWith('구글 계정 선택 화면을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'warn'));
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  });

  it('고지 한 줄에 이용약관과 개인정보 처리방침 링크가 있다', () => {
    open(null, 'guest');
    expect(screen.getByRole('link', { name: '이용약관' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute('target', '_blank');
  });

  it('이메일 폼은 접혀 있다가 텍스트 링크를 누르면 같은 창 안에서 펼쳐진다', () => {
    open(null, 'guest');
    expect(screen.queryByLabelText('이메일')).toBeNull();
    const toggle = screen.getByRole('button', { name: '기존 이메일 계정으로 로그인' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

describe('게스트가 이메일 계정으로 로그인', () => {
  const fill = () => {
    fireEvent.click(screen.getByRole('button', { name: '기존 이메일 계정으로 로그인' }));
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'old@example.com' } });
    fireEvent.change(screen.getByLabelText(/^비밀번호/), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  };

  it('진행이 사라진다는 확인을 먼저 띄우고 확인하기 전에는 로그인하지 않는다', async () => {
    open(null, 'guest');
    fill();
    expect(await screen.findByText('지금 게스트 진행은 사라져요.')).toBeInTheDocument();
    expect(actions.signInAccount).not.toHaveBeenCalled();
  });

  it('확인하면 로그인하고 계정 교체를 알린 뒤 창을 닫는다', async () => {
    const { onAuthChanged, onClose } = open(null, 'guest');
    fill();
    await screen.findByText('지금 게스트 진행은 사라져요.');
    const dialog = screen.getByText('지금 게스트 진행은 사라져요.').closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(dialog.querySelector('button.primary') as HTMLElement);
    await waitFor(() => expect(actions.signInAccount).toHaveBeenCalledWith('old@example.com', 'secret1'));
    await waitFor(() => expect(onAuthChanged).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalled();
  });

  it('확인 창을 닫으면 로그인하지 않는다', async () => {
    open(null, 'guest');
    fill();
    await screen.findByText('지금 게스트 진행은 사라져요.');
    const dialog = screen.getByText('지금 게스트 진행은 사라져요.').closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(dialog.querySelector('[aria-label="닫기"]') as HTMLElement);
    await waitFor(() => expect(screen.queryByText('지금 게스트 진행은 사라져요.')).toBeNull());
    expect(actions.signInAccount).not.toHaveBeenCalled();
  });

  it('입력이 비어 있으면 확인 없이 경고한다', async () => {
    const { setToast } = open(null, 'guest');
    fireEvent.click(screen.getByRole('button', { name: '기존 이메일 계정으로 로그인' }));
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    await waitFor(() => expect(setToast).toHaveBeenCalledWith('이메일과 6자 이상의 비밀번호를 입력해 주세요.', 'warn'));
    expect(actions.signInAccount).not.toHaveBeenCalled();
  });
});

describe('이메일 로그인 실패 안내', () => {
  const fill = () => {
    fireEvent.click(screen.getByRole('button', { name: '기존 이메일 계정으로 로그인' }));
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'old@example.com' } });
    fireEvent.change(screen.getByLabelText(/^비밀번호/), { target: { value: 'secret1' } });
  };
  const submit = async () => {
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    const dialog = (await screen.findByText('지금 게스트 진행은 사라져요.')).closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(dialog.querySelector('button.primary') as HTMLElement);
  };
  const FAIL = ['로그인하지 못했어요.', '이메일로는 새 계정을 만들 수 없어요.', '이메일 계정이 없거나 이미 구글 계정을 연결했다면 Google로 계속하기를 눌러 주세요.'];

  it('폼에는 사전 안내 두 줄이 없다', () => {
    open(null, 'guest');
    fill();
    expect(screen.queryByText(/이미 만든 이메일 계정으로만/)).toBeNull();
  });

  it('실패하면 알림 대신 폼 안의 상태 알림에 문장마다 한 줄로 알리고 원문 오류는 보이지 않는다', async () => {
    actions.signInAccount.mockResolvedValue({ ok: false, msg: 'raw server (401)', code: 'invalid_credentials' });
    const { setToast, onClose } = open(null, 'guest');
    fill();
    await submit();
    const status = await screen.findByRole('status');
    await waitFor(() => expect(Array.from(status.querySelectorAll('p')).map(p => p.textContent)).toEqual(FAIL));
    expect(screen.queryByText(/raw server/)).toBeNull();
    expect(setToast).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('연속 두 번 실패하면 안내가 겹치지 않고 바뀐다', async () => {
    actions.signInAccount.mockResolvedValueOnce({ ok: false, msg: 'x', code: 'invalid_credentials' });
    actions.signInAccount.mockResolvedValueOnce({ ok: false, msg: 'x', code: 'over_email_send_rate_limit' });
    open(null, 'guest');
    fill();
    await submit();
    await screen.findByText('이메일로는 새 계정을 만들 수 없어요.');
    await submit();
    await screen.findByText('요청이 너무 잦아요.');
    expect(screen.queryByText('이메일로는 새 계정을 만들 수 없어요.')).toBeNull();
    expect(screen.getAllByText('로그인하지 못했어요.')).toHaveLength(1);
  });

  it('실패 뒤 성공하면 안내가 사라진다', async () => {
    actions.signInAccount.mockResolvedValueOnce({ ok: false, msg: 'x', code: 'network' });
    const { onClose } = open(null, 'guest');
    fill();
    await submit();
    await screen.findByText('서버에 연결하지 못했어요.');
    await submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText('로그인하지 못했어요.')).toBeNull();
  });

  it('코드가 없는 실패는 두 줄이다', async () => {
    actions.signInAccount.mockResolvedValue({ ok: false, msg: 'x' });
    open(null, 'guest');
    fill();
    await submit();
    await screen.findByText('잠시 뒤 다시 시도해 주세요.');
    expect(screen.getAllByText(/./, { selector: '[role="status"] p' })).toHaveLength(2);
  });

  it('폼을 접으면 안내가 없다', async () => {
    actions.signInAccount.mockResolvedValue({ ok: false, msg: 'x', code: 'validation_failed' });
    open(null, 'guest');
    fill();
    await submit();
    await screen.findByText('이메일 형식을 확인해 주세요.');
    const toggle = screen.getByRole('button', { name: '기존 이메일 계정으로 로그인' });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByText('이메일 형식을 확인해 주세요.')).toBeNull();
  });
});

describe('로그인 방식별 구성', () => {
  it('이메일 계정은 비밀번호 로그인이 지워진다는 안내와 구글 버튼을 보이고 이메일 폼은 없다', async () => {
    open('old@example.com', 'email');
    expect(screen.getByText('연결하면 이메일과 비밀번호로는 더 이상 로그인할 수 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '기존 이메일 계정으로 로그인' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    await waitFor(() => expect(actions.connectGoogle).toHaveBeenCalledWith('email'));
  });

  it('구글 계정은 연결 구역과 구글 버튼이 없고 로그아웃과 약관 링크가 있다', () => {
    open('me@gmail.test', 'google');
    expect(screen.queryByRole('button', { name: 'Google로 계속하기' })).toBeNull();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '이용약관' })).toBeInTheDocument();
  });

  it('수단을 아직 읽지 못한 계정은 연결 구역을 보이지 않는다', () => {
    open('old@example.com', null);
    expect(screen.queryByRole('button', { name: 'Google로 계속하기' })).toBeNull();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
  });

  it('읽는 중에는 실패 안내 없이 보조 기술에 알리는 상태 영역을 둔다', () => {
    open('old@example.com', null);
    expect(screen.queryByText(/불러오지 못했어요/)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('로그인 방식을 불러오고 있어요');
  });

  it('읽는 동안은 이메일 계정의 연결 구역을 보이지 않게 그대로 두어 같은 높이를 차지하고 조작할 수 없다', () => {
    open('old@example.com', null);
    const status = screen.getByRole('status');
    const hidden = status.querySelector('[aria-hidden="true"][inert]') as HTMLElement;
    expect(hidden).not.toBeNull();
    expect(hidden).toHaveClass('invisible');
    expect(hidden).toHaveTextContent('연결하면 이메일과 비밀번호로는 더 이상 로그인할 수 없어요.');
    const button = hidden.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.tabIndex).toBe(-1);
  });

  it('게임 서버가 없는 로컬 모드에서는 연결 구역도 실패 안내도 보이지 않는다', () => {
    actions.configured = false;
    actions.failed = true;
    open('dev@localhost', null);
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/불러오지 못했어요/)).toBeNull();
  });

  it('수단 조회가 실패하면 안내와 다시 시도 버튼을 보이고 누르면 다시 읽는다', () => {
    actions.failed = true;
    open('old@example.com', null);
    expect(screen.getByText(/로그인 방식을 불러오지 못했어요\./).innerHTML).toBe('로그인 방식을 불러오지 못했어요.<br>잠시 뒤 다시 시도해 주세요.');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(actions.retry).toHaveBeenCalledTimes(1);
  });
});
