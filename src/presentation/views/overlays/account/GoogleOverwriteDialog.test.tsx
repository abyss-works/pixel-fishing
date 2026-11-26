// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import GoogleOverwriteDialog from './GoogleOverwriteDialog';
import { resetKeyScopes } from '../../../ui/hotkeys';
import { resetOpenWindows } from '../../../ui/openWindows';

afterEach(() => {
  cleanup();
  resetOpenWindows();
  resetKeyScopes();
});

describe('GoogleOverwriteDialog', () => {
  it('전환 다이어그램, 2줄 사각 불릿 안내, 1행 2열 균형 버튼을 렌더링한다', () => {
    render(<GoogleOverwriteDialog onProceed={vi.fn()} onBack={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '구글 계정으로 로그인' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass('w-[min(400px,calc(100%-32px))]', 'mobile:w-[calc(100%-48px)]');

    const summary = screen.getByLabelText('진행 전환 요약');
    expect(summary).toHaveClass('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]', 'mobile:p-2', 'mobile:gap-1.5');
    expect(within(summary).getByText('현재 게스트 진행')).toBeInTheDocument();
    expect(within(summary).getByText('사라짐')).toHaveClass('text-danger');
    expect(summary.querySelector('[data-glyph="arrowRight"]')).not.toBeNull();
    expect(within(summary).getByText('구글 계정 진행')).toHaveClass('text-gold');
    expect(within(summary).getByText('불러옴')).toHaveClass('text-gold');
    expect(summary.querySelector('svg[viewBox="0 0 48 48"]')).not.toBeNull();

    expect(screen.getByText('이미 다른 계정에 연결된 구글 계정이에요.')).toBeInTheDocument();
    const warnAnchor = screen.getByText('지금 게스트 진행은 되돌릴 수 없어요.');
    expect(warnAnchor.tagName).toBe('STRONG');
    expect(warnAnchor).toHaveClass('text-danger', 'font-bold');
    expect(warnAnchor.parentElement).toHaveTextContent('전환하면 지금 게스트 진행은 되돌릴 수 없어요.');
    expect(screen.queryByText(/다른 구글 계정으로 연결할 수 있어요/)).toBeNull();

    const backBtn = screen.getByRole('button', { name: '되돌아가기' });
    const confirmBtn = screen.getByRole('button', { name: '계정 전환' });
    expect(backBtn).not.toHaveClass('primary');
    expect(confirmBtn).toHaveClass('primary');
    expect(backBtn).toHaveClass('whitespace-nowrap');
    expect(confirmBtn).toHaveClass('whitespace-nowrap');
    expect(backBtn.parentElement).toBe(confirmBtn.parentElement);
    expect(backBtn.parentElement).toHaveClass('grid', 'grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]');
    expect(backBtn.compareDocumentPosition(confirmBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('계정 전환은 onProceed를, 되돌아가기·닫기·Esc·바깥 클릭은 onBack을 호출한다', () => {
    const onProceed = vi.fn();
    const onBack = vi.fn();
    render(<GoogleOverwriteDialog onProceed={onProceed} onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: '계정 전환' }));
    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '되돌아가기' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onBack).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(3);

    const dialog = screen.getByRole('dialog', { name: '구글 계정으로 로그인' });
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onBack).toHaveBeenCalledTimes(4);
  });
});
