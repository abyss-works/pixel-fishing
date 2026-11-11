import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LetterModal from './LetterModal';

afterEach(cleanup);

const open = (guest: boolean) => {
  const dispatch = vi.fn(() => ({ status: 'ok' as const }));
  const view = render(<LetterModal dispatch={dispatch as never} setToast={vi.fn()} guest={guest} onClose={vi.fn()} />);
  return { dispatch, ...view };
};

describe('LetterModal', () => {
  it('계정 사용자는 입력 칸이 열려 있고 건의 안내 툴팁을 보며 편지를 보낸다', () => {
    const { dispatch } = open(false);
    const field = screen.getByPlaceholderText('예) 가방 칸을 조금 늘려 주세요');
    fireEvent.change(field, { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'sendLetter', text: '안녕하세요' });
    expect(screen.queryByRole('group', { name: '편지' })).toBeNull();
  });

  it('게스트는 입력 칸과 보내기가 비활성인 공용 잠금이고 이유를 툴팁으로 보인다', () => {
    const { dispatch, baseElement } = open(true);
    expect((screen.getByPlaceholderText('예) 가방 칸을 조금 늘려 주세요') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '보내기' }) as HTMLButtonElement).disabled).toBe(true);
    expect(baseElement.querySelector('[data-glyph="lock"]')).not.toBeNull();
    expect(baseElement.querySelector('[title]')).toBeNull();
    const group = screen.getByRole('group', { name: '편지' });
    fireEvent.mouseEnter(group.parentElement!);
    const lines = [...screen.getByRole('tooltip').querySelectorAll('.block')].map(e => e.textContent);
    expect(lines).toEqual(['편지는 계정을 연결하면 쓸 수 있어요.', '답장을 계정 이메일로 드리기 때문이에요.']);
    fireEvent.mouseLeave(group.parentElement!);
    fireEvent.click(group);
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    fireEvent.mouseLeave(group.parentElement!);
    const sendGroup = screen.getByRole('group', { name: '보내기' });
    fireEvent.mouseEnter(sendGroup.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('편지는 계정을 연결하면 쓸 수 있어요.');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
