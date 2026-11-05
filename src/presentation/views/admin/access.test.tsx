// 관리자 가드. 관리자로 확인되기 전에는 대시보드를 그리지 않고 상태별 화면 하나만 보인다. 로컬 모드는 골격을 그대로 보인다.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QueryProvider } from '../../../core/QueryProvider';
import { AdminAuthCtx } from '../../../features/admin/service/accessContext';
import type { AdminAuth } from '../../../features/admin/service/accessContext';
import { AdminGate } from './access';

afterEach(cleanup);

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
    expect(screen.getByText(/확인하는 중/)).toBeInTheDocument();
  });

  it('관리자 세션이 없으면 로그인 화면만 보인다', () => {
    renderGate({ access: 'signedOut', uid: null });
    expect(screen.queryByText('대시보드 본문')).not.toBeInTheDocument();
    expect(screen.getByLabelText('이메일')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
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
