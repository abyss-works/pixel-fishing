// 계정 식별 표기 — "닉네임(이메일)"과 짧은 uid를 적고, 호버 시 대화형 복사 카드를 여는지 확인한다.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import UserIdentity from './UserIdentity';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const UID = 'abcdef01-2345-4678-9abc-def012345678';

describe('계정 식별 표기', () => {
  it('가입 계정은 닉네임(이메일)과 짧은 uid를 적고 전체 uid는 title에 둔다', () => {
    render(<UserIdentity user={{ user_id: UID, nickname: '갈치', email: 'galchi@example.com', is_anonymous: false }} />);
    expect(screen.getByText('갈치(galchi@example.com)')).toBeInTheDocument();
    expect(screen.getByText('abcdef01')).toBeInTheDocument();
    expect(screen.getByTitle(UID)).toBeInTheDocument();
  });

  it('게스트는 이메일 대신 게스트, 닉네임이 없으면 이름 없음이다', () => {
    render(<>
      <UserIdentity user={{ user_id: UID, nickname: '갈치', email: null, is_anonymous: true }} />
      <UserIdentity inline user={{ user_id: UID, nickname: null, email: 'galchi@example.com', is_anonymous: false }} />
    </>);
    expect(screen.getByText('갈치(게스트)')).toBeInTheDocument();
    expect(screen.getByText('이름 없음(galchi@example.com)')).toBeInTheDocument();
    expect(screen.getAllByText('abcdef01')).toHaveLength(2);
  });

  it('opHandle 비식별 투영에서는 원본 user_id와 이메일 빈칸(—)을 노출하지 않는다', () => {
    render(
      <>
        <UserIdentity user={{ user_id: UID, opHandle: 'op-11223344', nickname: '갈치', email: null, is_anonymous: false }} />
        <UserIdentity user={{ user_id: 'raw-secret-uid', opHandle: 'op-99887766', nickname: null, email: null, is_anonymous: null }} />
      </>,
    );
    expect(screen.getByText('갈치')).toBeInTheDocument();
    expect(screen.getByText('op-11223344')).toBeInTheDocument();
    expect(screen.getByText('이름 없음')).toBeInTheDocument();
    expect(screen.getByText('op-99887766')).toBeInTheDocument();
    expect(screen.queryByTitle(UID)).toBeNull();
    expect(screen.queryByTitle('raw-secret-uid')).toBeNull();
    expect(screen.queryByText(/—/)).toBeNull();
    expect(document.body.textContent).not.toContain(UID);
    expect(document.body.textContent).not.toContain('raw-secret-uid');
  });

  it('호버 카드에서 admin은 닉네임·이메일·UUID를 복사하고, maintainer는 이메일 없이 닉네임·UUID만 복사한다', () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <UserIdentity user={{ user_id: UID, nickname: '갈치', email: 'galchi@example.com', is_anonymous: false }} />,
    );
    fireEvent.mouseEnter(screen.getByText('갈치(galchi@example.com)'));
    const adminTip = screen.getByRole('tooltip');
    expect(within(adminTip).getByText('닉네임')).toBeInTheDocument();
    expect(within(adminTip).getByText('이메일')).toBeInTheDocument();
    expect(within(adminTip).getByText('UUID')).toBeInTheDocument();
    expect(within(adminTip).getByText(UID)).toBeInTheDocument();

    const copyButtons = within(adminTip).getAllByRole('button', { name: '복사' });
    expect(copyButtons).toHaveLength(3);
    fireEvent.click(copyButtons[1]);
    expect(writeText).toHaveBeenCalledWith('galchi@example.com');
    expect(within(adminTip).getByRole('button', { name: '복사됨' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1200); });
    expect(within(adminTip).queryByRole('button', { name: '복사됨' })).toBeNull();

    cleanup();

    render(
      <UserIdentity user={{ user_id: UID, nickname: '갈치', email: null, is_anonymous: false }} />,
    );
    fireEvent.mouseEnter(screen.getByText('갈치'));
    const maintTip = screen.getByRole('tooltip');
    expect(within(maintTip).getByText('닉네임')).toBeInTheDocument();
    expect(within(maintTip).queryByText('이메일')).toBeNull();
    expect(within(maintTip).getByText('UUID')).toBeInTheDocument();
    expect(within(maintTip).getByText(UID)).toBeInTheDocument();

    const maintCopyButtons = within(maintTip).getAllByRole('button', { name: '복사' });
    expect(maintCopyButtons).toHaveLength(2);
    fireEvent.click(maintCopyButtons[1]);
    expect(writeText).toHaveBeenCalledWith(UID);
  });
});
