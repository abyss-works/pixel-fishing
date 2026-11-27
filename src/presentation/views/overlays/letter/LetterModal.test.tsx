import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AccountLockState } from '../../../../features/display/model/menuLock';
import LetterModal from './LetterModal';

afterEach(cleanup);

const open = (accountState: AccountLockState) => {
  const dispatch = vi.fn(() => ({ status: 'ok' as const }));
  const view = render(<LetterModal dispatch={dispatch as never} setToast={vi.fn()} accountState={accountState} onClose={vi.fn()} />);
  return { dispatch, ...view };
};

describe('LetterModal', () => {
  it('계정 사용자는 입력 칸이 툴팁에 가리지 않고 열려 있으며 편지를 보낸다', () => {
    const { dispatch } = open('account');
    const field = screen.getByPlaceholderText('예) 가방 칸을 조금 늘려 주세요');
    fireEvent.mouseEnter(field);
    expect(screen.queryByRole('tooltip')).toBeNull();
    const hint = screen.getByText(/답장은 계정 이메일로 드려요/);
    expect(hint).toBeInTheDocument();
    expect(hint.textContent).toBe('건의, 버그 제보, 하고 싶은 말 아무거나 좋아요.\n답장은 계정 이메일로 드려요.');
    fireEvent.change(field, { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'sendLetter', text: '안녕하세요' });
    expect(screen.queryByRole('group', { name: '편지' })).toBeNull();
  });

  it('게스트는 입력 칸과 보내기가 비활성인 공용 잠금이고 바깥 자물쇠 배지 없이 이유를 툴팁으로 보인다', () => {
    const { dispatch, baseElement } = open('guest');
    expect((screen.getByPlaceholderText('예) 가방 칸을 조금 늘려 주세요') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '보내기' }) as HTMLButtonElement).disabled).toBe(true);
    expect(baseElement.querySelector('[data-glyph="lock"]')).toBeNull();
    expect(baseElement.querySelector('[title]')).toBeNull();
    const group = screen.getByRole('group', { name: '편지' });
    fireEvent.mouseEnter(group.parentElement!);
    const lines = [...screen.getByRole('tooltip').querySelectorAll('.block')].map(e => e.textContent);
    expect(lines).toEqual(['편지는 태평양 항로가 열리면 쓸 수 있어요.', '태평양 항로는 조각배(1단계)부터 열려요.']);
    fireEvent.mouseLeave(group.parentElement!);
    fireEvent.click(group);
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    fireEvent.mouseLeave(group.parentElement!);
    const sendGroup = screen.getByRole('group', { name: '보내기' });
    fireEvent.mouseEnter(sendGroup.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('편지는 태평양 항로가 열리면 쓸 수 있어요.');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
