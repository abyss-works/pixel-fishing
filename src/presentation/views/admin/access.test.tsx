// 관리자 가드. 관리자로 확인되기 전에는 대시보드를 그리지 않고 상태별 화면 하나만 보인다. 로컬 모드는 골격을 그대로 보인다.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../platform/api';
import { QueryProvider } from '../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../features/admin/service/accessContext';
import type { AdminAuth } from '../../../features/admin/service/accessContext';
import { AdminGate } from './access';

// 테스트 빌드는 로컬 모드라 관리자 로그인이 꺼져 있다. 클라우드 빌드처럼 로그인 복귀 읽기를 켠다
vi.mock('../../../features/admin/service/queries', async importOriginal => ({
  ...await importOriginal<typeof import('../../../features/admin/service/queries')>(),
  adminSignInRequired: true,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const UID = '00000000-0000-4000-8000-000000000001';

function renderGate(auth: AdminAuth) {
  render(
    <QueryProvider>
      <AdminAuthCtx.Provider value={auth}>
        <AdminGate><p>대시보드 본문</p></AdminGate>
      </AdminAuthCtx.Provider>
    </QueryProvider>,
  );
}

describe('AdminGate', () => {
  it('확인 중에는 대시보드를 그리지 않는다', () => {
    renderGate({ access: 'checking', uid: null });
    expect(screen.queryByText('대시보드 본문')).not.toBeInTheDocument();
    expect(screen.getByText('접근 권한을 확인하고 있어요.')).toBeInTheDocument();
  });

  it('관리자 세션이 없으면 로그인 화면만 보인다', () => {
    renderGate({ access: 'signedOut', uid: null });
    expect(screen.queryByText('대시보드 본문')).not.toBeInTheDocument();
    expect(screen.getByText(/게임에서 관리자 계정에 연결한 구글 계정으로 로그인해요\./)).toBeInTheDocument();
    expect(screen.getByText(/게임의 로그인 상태와는 따로 유지돼요\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeEnabled();
    expect(screen.queryByLabelText('이메일')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
  });

  it('구글 버튼을 누르면 구글 로그인을 시작한다', async () => {
    const signIn = vi.spyOn(api.admin, 'signIn').mockResolvedValue({ ok: true });
    renderGate({ access: 'signedOut', uid: null });
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeDisabled();
    // 시작이 성공으로 끝나 이동하는 동안에도 버튼은 잠긴 채다
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeDisabled();
  });

  it('구글 로그인을 시작하지 못하면 안내를 보이고 버튼을 다시 누를 수 있다', async () => {
    vi.spyOn(api.admin, 'signIn').mockResolvedValue({ ok: false, msg: '구글 인증 주소를 받지 못했어요.' });
    renderGate({ access: 'signedOut', uid: null });
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    expect(await screen.findByText('구글 인증 주소를 받지 못했어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeEnabled();
  });

  it('연결한 적 없는 구글 계정으로 돌아오면 버튼 위에 안내하고 버튼은 다시 누를 수 있다', async () => {
    vi.spyOn(api.admin, 'takeSignInReturn').mockReturnValue({ error: 'signup_disabled' });
    renderGate({ access: 'signedOut', uid: null });
    const notice = await screen.findByText(/연결한 적 없는 구글 계정으로는 로그인할 수 없어요\./);
    expect(notice.textContent).toBe('연결한 적 없는 구글 계정으로는 로그인할 수 없어요.\n관리자 계정에 연결한 구글 계정으로 다시 로그인해 주세요.');
    const button = screen.getByRole('button', { name: 'Google로 계속하기' });
    expect(button).toBeEnabled();
    expect(notice.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('주소가 같은 이메일 계정이 있는 구글로 돌아오면 세 줄 안내를 보이고 버튼은 다시 누를 수 있다', async () => {
    vi.spyOn(api.admin, 'takeSignInReturn').mockReturnValue({ error: 'account_not_linked' });
    renderGate({ access: 'signedOut', uid: null });
    const notice = await screen.findByText(/주소가 같은 이메일 계정이 있어요\./);
    expect(notice.textContent).toBe('이 구글 계정과 주소가 같은 이메일 계정이 있어요.\n게임의 계정 관리에서 그 이메일 계정으로 로그인해 이 구글 계정을 연결해 주세요.\n그다음 여기서 다시 로그인해 주세요.');
    expect(notice).toHaveClass('text-danger');
    expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeEnabled();
  });

  it('구글 화면에서 취소하고 돌아오면 정보색 한 줄 안내를 보인다', async () => {
    vi.spyOn(api.admin, 'takeSignInReturn').mockReturnValue({ error: 'access_denied' });
    renderGate({ access: 'signedOut', uid: null });
    const notice = await screen.findByText('구글 계정으로 로그인하지 않았어요.');
    expect(notice).not.toHaveClass('text-danger');
  });

  it.each(['internal_server_error', ''])('알 수 없는 실패 코드(%j)로 돌아오면 두 줄 경고 안내를 보인다', async error => {
    vi.spyOn(api.admin, 'takeSignInReturn').mockReturnValue({ error });
    renderGate({ access: 'signedOut', uid: null });
    const notice = await screen.findByText(/구글 계정으로 로그인하지 못했어요\./);
    expect(notice.textContent).toBe('구글 계정으로 로그인하지 못했어요.\n잠시 뒤 다시 시도해 주세요.');
    expect(notice).toHaveClass('text-danger');
    expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeEnabled();
  });

  it('시작 실패 안내가 복귀 안내보다 앞서고 줄 구성을 그대로 보인다', async () => {
    vi.spyOn(api.admin, 'takeSignInReturn').mockReturnValue({ error: 'signup_disabled' });
    vi.spyOn(api.admin, 'signIn').mockResolvedValue({
      ok: false, msg: '구글 계정 선택 화면을 열지 못했어요.\n서버에서 502 응답을 받았어요.\n잠시 뒤 다시 시도해 주세요.',
    });
    renderGate({ access: 'signedOut', uid: null });
    await screen.findByText(/연결한 적 없는 구글 계정으로는/);
    fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
    const failure = await screen.findByText(/서버에서 502 응답을 받았어요\./);
    expect(failure.textContent).toBe('구글 계정 선택 화면을 열지 못했어요.\n서버에서 502 응답을 받았어요.\n잠시 뒤 다시 시도해 주세요.');
    expect(failure).toHaveClass('text-danger');
    expect(screen.queryByText(/연결한 적 없는 구글 계정으로는/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeEnabled();
  });

  it('오류 없이 돌아오면 안내를 보이지 않는다', async () => {
    const take = vi.spyOn(api.admin, 'takeSignInReturn').mockReturnValue({ error: null });
    renderGate({ access: 'signedOut', uid: null });
    await waitFor(() => expect(take).toHaveBeenCalled());
    expect(screen.queryByText(/로그인할 수 없어요|로그인하지/)).not.toBeInTheDocument();
  });

  it('관리자가 아닌 계정이면 권한 없음 안내와 로그아웃만 보인다', () => {
    renderGate({ access: 'denied', uid: UID });
    expect(screen.queryByText('대시보드 본문')).not.toBeInTheDocument();
    expect(screen.getByText(/운영자로 등록되지 않은 계정/)).toBeInTheDocument();
    expect(screen.getByText(UID)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/SQL Editor|insert into/i);
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
    expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument();
  });

  it('권한을 확인하지 못하면 다시 시도하라고 안내하고 대시보드를 그리지 않는다', () => {
    renderGate({ access: 'denied', uid: null });
    expect(screen.queryByText('대시보드 본문')).not.toBeInTheDocument();
    expect(screen.getByText(/권한을 확인하지 못했어요/)).toBeInTheDocument();
  });

  it('관리자면 대시보드를 그린다', () => {
    renderGate({ access: 'granted', uid: UID });
    expect(screen.getByText('대시보드 본문')).toBeInTheDocument();
  });

  it('로컬 모드는 대시보드 골격을 그린다', () => {
    renderGate({ access: 'local', uid: null });
    expect(screen.getByText('대시보드 본문')).toBeInTheDocument();
  });
});
