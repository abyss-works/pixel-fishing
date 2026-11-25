// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  deleteAccount: vi.fn<() => Promise<{ ok: true } | { ok: false; msg: string }>>(),
  clearPendingSailReturn: vi.fn(),
}));

vi.mock('../../../../features/account/service/accountActions', () => ({
  deleteAccount: () => mocks.deleteAccount(),
}));

vi.mock('../../../../features/account/service/sailReturn', () => ({
  clearPendingSailReturn: () => mocks.clearPendingSailReturn(),
}));

import ConsentModal from './ConsentModal';
import { resetKeyScopes } from '../../../ui/hotkeys';
import { resetOpenWindows } from '../../../ui/openWindows';

const CONSENT = { required: true, version: '2026-11-25', effectiveAt: '2026-11-25T00:00:00.000Z' };

describe('ConsentModal', () => {
  beforeEach(() => {
    mocks.deleteAccount.mockReset().mockResolvedValue({ ok: true });
    mocks.clearPendingSailReturn.mockReset();
  });
  afterEach(() => {
    cleanup();
    resetOpenWindows();
    resetKeyScopes();
  });

  it('이용약관 동의 안내, 새 탭 링크 2종, 버튼 4개를 보이고 Esc·바깥 클릭으로 닫히지 않는다', async () => {
    const onAccept = vi.fn();
    render(
      <ConsentModal consent={CONSENT} mismatch={false} error={null} busy={false} onAccept={onAccept} />,
    );

    const dialog = screen.getByRole('dialog', { name: '이용약관 동의' });
    expect(dialog).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull();
    expect(screen.getByText('2026-11-25부터 이용약관이 시행돼요.')).toBeInTheDocument();
    expect(screen.getByText('기존 계정은 약관에 동의해야 이어서 플레이할 수 있어요.')).toBeInTheDocument();
    expect(screen.getByText(/동의하고 시작을 누르면 만 14세 이상이며/)).toBeInTheDocument();

    const terms = screen.getByRole('link', { name: '이용약관' });
    expect(terms).toHaveAttribute('href', '/terms');
    expect(terms).toHaveAttribute('target', '_blank');

    const privacy = screen.getByRole('link', { name: '개인정보 처리방침' });
    expect(privacy).toHaveAttribute('href', '/privacy');
    expect(privacy).toHaveAttribute('target', '_blank');

    const inquiry = screen.getByRole('link', { name: '문의' });
    expect(inquiry).toHaveAttribute('href', 'mailto:contact@abyssworks.dev');
    expect(screen.getByText(/contact@abyssworks\.dev/)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '동의하고 시작' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '나중에 하기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계정 삭제' })).toBeInTheDocument();

    // Esc 및 백드롭 클릭으로 닫히지 않는다
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(screen.getByRole('dialog', { name: '이용약관 동의' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '동의하고 시작' }));
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
  });

  it('409 버전 변경 시 재확인 안내 문구를 표시한다', () => {
    render(
      <ConsentModal consent={{ ...CONSENT, version: '2026-12-01' }} mismatch error={null} busy={false} onAccept={vi.fn()} />,
    );
    expect(screen.getByText('2026-12-01부터 이용약관이 시행돼요.')).toBeInTheDocument();
    expect(screen.getByText(/확인하는 사이에 이용약관이 바뀌었어요\./)).toBeInTheDocument();
    expect(screen.getByText(/새 이용약관을 확인한 뒤 다시 동의하고 시작을 눌러 주세요\./)).toBeInTheDocument();
  });

  it('나중에 하기를 누르면 모달 내 대기 상태로 전환하고 이용약관 다시 보기로 돌아간다', () => {
    render(
      <ConsentModal consent={CONSENT} mismatch={false} error={null} busy={false} onAccept={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '나중에 하기' }));
    expect(screen.getByText('이용약관에 동의하지 않아 게임을 시작하지 않았어요.')).toBeInTheDocument();
    expect(screen.getByText('진행과 기록은 그대로 남으며 다음 접속에서 다시 물어요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '이용약관 다시 보기' }));
    expect(screen.getByRole('button', { name: '동의하고 시작' })).toBeInTheDocument();
  });

  it('계정 삭제를 누르면 모달 내부 단계로 전환해 "삭제" 입력을 확인하고, 일치 시 삭제 후 새로고침한다', async () => {
    const onReload = vi.fn();
    render(
      <ConsentModal consent={CONSENT} mismatch={false} error={null} busy={false} onAccept={vi.fn()} onReload={onReload} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '계정 삭제' }));
    // 새 앱 모달(z-app-modal)을 겹치지 않고 같은 차단 모달 내부에서 전환된다
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('계정을 삭제하면 모든 진행과 기록이 영구 삭제되며 되돌릴 수 없어요.')).toBeInTheDocument();
    expect(screen.getByText('삭제하려면 아래 칸에 “삭제”를 입력해 주세요.')).toBeInTheDocument();

    // 불일치 시 오류 문구를 보이고 삭제를 요청하지 않는다
    const input = screen.getByLabelText('확인 문구');
    fireEvent.change(input, { target: { value: '아니오' } });
    fireEvent.click(screen.getByRole('button', { name: '계정 삭제' }));
    expect(screen.getByText('확인 문구가 달라 삭제하지 않았어요.')).toBeInTheDocument();
    expect(mocks.deleteAccount).not.toHaveBeenCalled();

    // 취소 시 동의 화면으로 복귀한다
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('button', { name: '동의하고 시작' })).toBeInTheDocument();

    // 다시 진입해 "삭제" 입력 후 삭제 성공 시 세션 표지 정리 후 새로고침한다
    fireEvent.click(screen.getByRole('button', { name: '계정 삭제' }));
    fireEvent.change(screen.getByLabelText('확인 문구'), { target: { value: '삭제' } });
    fireEvent.click(screen.getByRole('button', { name: '계정 삭제' }));
    await waitFor(() => expect(mocks.deleteAccount).toHaveBeenCalledTimes(1));
    expect(mocks.clearPendingSailReturn).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
