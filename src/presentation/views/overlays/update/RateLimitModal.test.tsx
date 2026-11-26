// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RateLimitModal from './RateLimitModal';
import { resetKeyScopes } from '../../../ui/hotkeys';
import { resetOpenWindows } from '../../../ui/openWindows';

afterEach(() => {
  cleanup();
  resetOpenWindows();
  resetKeyScopes();
});

describe('RateLimitModal', () => {
  it('불투명 차단기 배경 위에 제목, 중복 없는 안내 문구, 새로고침 버튼을 렌더한다', () => {
    render(<RateLimitModal />);

    const dialog = screen.getByRole('dialog', { name: '접속이 몰려 있어요' });
    expect(dialog).toBeInTheDocument();
    const backdrop = dialog.parentElement!;
    expect(backdrop.className).toContain('bg-bg');
    expect(backdrop.className).toContain('z-(--z-blocker)');
    expect(backdrop.className).not.toContain('bg-[rgba');

    expect(screen.getByText('같은 네트워크에서 접속이 잠시 몰려 있어요. 잠시 뒤 다시 시도해 주세요.')).toBeInTheDocument();
    const body = screen.getByText('조금 기다린 뒤 새로고침하면 이어서 접속할 수 있어요.');
    expect(body).toBeInTheDocument();
    expect(body.textContent).not.toContain('잠시');

    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull();
    const refresh = screen.getByRole('button', { name: '새로고침' });
    expect(refresh).toHaveClass('primary', 'full');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '접속이 몰려 있어요' })).toBeInTheDocument();
  });
});
