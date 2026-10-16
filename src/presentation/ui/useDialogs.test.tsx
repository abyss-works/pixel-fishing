// 게임 대화상자 훅 — 확인·입력·알림이 사용자의 답을 Promise로 돌려준다.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useDialogs } from './useDialogs';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { resetKeyScopes } from './hotkeys';

afterEach(() => { cleanup(); resetKeyScopes(); });

const holder: { api: ReturnType<typeof useDialogs> | null } = { api: null };
function Harness(): ReactNode {
  const dialogs = useDialogs();
  useEffect(() => { holder.api = dialogs; });
  return dialogs.dialogs;
}
const api = new Proxy({} as ReturnType<typeof useDialogs>, { get: (_, k) => holder.api![k as keyof ReturnType<typeof useDialogs>] });

describe('useDialogs', () => {
  it('확인은 확정이면 true, 닫기(Esc)면 false', async () => {
    render(<Harness />);
    let answer: Promise<boolean>;
    act(() => { answer = api.confirm({ title: '로그아웃', body: '로그아웃할까요?', confirmLabel: '로그아웃' }); });
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    await expect(answer!).resolves.toBe(true);
    expect(screen.queryByText('로그아웃할까요?')).toBeNull();

    act(() => { answer = api.confirm({ title: '로그아웃', body: '로그아웃할까요?', confirmLabel: '로그아웃' }); });
    fireEvent.keyDown(document, { key: 'Escape' });
    await expect(answer!).resolves.toBe(false);
  });

  it('입력은 넣은 값을, 취소면 null을 돌려준다 — 빈 값이면 확정할 수 없다', async () => {
    render(<Harness />);
    let answer: Promise<string | null>;
    act(() => { answer = api.input({ title: '이사 코드 불러오기', label: '이사 코드', confirmLabel: '불러오기' }); });
    expect(screen.getByRole('button', { name: '불러오기' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('이사 코드'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: '불러오기' }));
    await expect(answer!).resolves.toBe('abc');

    act(() => { answer = api.input({ title: '이사 코드 불러오기', label: '이사 코드', confirmLabel: '불러오기' }); });
    fireEvent.keyDown(document, { key: 'Escape' });
    await expect(answer!).resolves.toBeNull();
  });

  it('알림은 복사할 값을 읽기 전용 칸에 담고 확인으로 닫힌다', async () => {
    render(<Harness />);
    let done: Promise<void>;
    act(() => { done = api.notice({ title: '직접 복사', body: '아래 값을 복사하세요.', value: 'uid-123' }); });
    expect(screen.getByLabelText('복사할 값')).toHaveValue('uid-123');
    expect(screen.getByLabelText('복사할 값')).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await expect(done!).resolves.toBeUndefined();
  });
});
