import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { resetToastEnabled } from '../../../../features/display/service/toastEnabled';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import type { GameAction } from '../../../../game/rules/actions';
import { REJECT_TEXT } from '../../../../game/rules/rules';
import SettingsModal from './SettingsModal';

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetToastEnabled();
});

function open(opts: {
  autoLockOnCatch?: boolean;
  dispatch?: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast?: ReturnType<typeof vi.fn>;
} = {}) {
  const dispatch = opts.dispatch ?? vi.fn(() => ({ status: 'ok' as const }));
  const setToast = opts.setToast ?? vi.fn();
  const view = render(
    <SettingsModal
      autoLockOnCatch={opts.autoLockOnCatch ?? false}
      dispatch={dispatch as never}
      setToast={setToast as never}
      onClose={vi.fn()}
    />,
  );
  return { dispatch, setToast, ...view };
}

describe('SettingsModal — 가방 설정(낚을 때 자동 잠금)', () => {
  it('가방 섹션에 낚을 때 자동 잠금 토글을 표시하고 클릭 시 setAutoLockOnCatch 액션을 보낸다', () => {
    const off = open({ autoLockOnCatch: false });
    expect(screen.getByText('가방')).toBeInTheDocument();
    const toggleOff = screen.getByRole('button', { name: '낚을 때 자동 잠금' });
    expect(toggleOff).toHaveAttribute('aria-pressed', 'false');
    expect(toggleOff).toHaveTextContent('꺼짐');
    fireEvent.click(toggleOff);
    expect(off.dispatch).toHaveBeenCalledWith({ type: 'setAutoLockOnCatch', on: true });

    cleanup();

    const on = open({ autoLockOnCatch: true });
    const toggleOn = screen.getByRole('button', { name: '낚을 때 자동 잠금' });
    expect(toggleOn).toHaveAttribute('aria-pressed', 'true');
    expect(toggleOn).toHaveTextContent('켜짐');
    fireEvent.click(toggleOn);
    expect(on.dispatch).toHaveBeenCalledWith({ type: 'setAutoLockOnCatch', on: false });
  });

  it('설명 문장은 본문에 두지 않고 라벨 툴팁으로 보여 준다', () => {
    open({ autoLockOnCatch: false });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByText(/직접 잠근/)).toBeNull();

    const label = screen.getByText('낚을 때 자동 잠금');
    fireEvent.mouseEnter(label);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('더 큰 물고기');
    expect(tip).toHaveTextContent('직접 잠근');
  });

  it('in-flight 가드 — 응답을 기다리는 동안 토글을 비활성화하고 중복 요청을 막는다', async () => {
    let finish!: (res: DispatchResult) => void;
    const dispatch = vi.fn(() => new Promise<DispatchResult>(resolve => { finish = resolve; }));
    open({ autoLockOnCatch: false, dispatch });

    const toggle = screen.getByRole('button', { name: '낚을 때 자동 잠금' }) as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(toggle.disabled).toBe(true);

    // 대기 중 추가 클릭은 무시한다
    fireEvent.click(toggle);
    expect(dispatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish({ status: 'ok', state: {} as never, result: { type: 'none' } });
    });
    expect(toggle.disabled).toBe(false);
  });

  it('규칙 거부 시 경고 토스트를 알린다', () => {
    const dispatch = vi.fn(() => ({ status: 'rejected' as const, error: 'bad-request' as const }));
    const { setToast } = open({ autoLockOnCatch: false, dispatch });
    fireEvent.click(screen.getByRole('button', { name: '낚을 때 자동 잠금' }));
    expect(setToast).toHaveBeenCalledWith(REJECT_TEXT['bad-request'], 'warn');
  });

  it('dispatch Promise 거부 시 in-flight 가드를 해제해 토글을 다시 활성화하고 예외를 전파한다', async () => {
    let reject!: (err: unknown) => void;
    const dispatch = vi.fn(() => new Promise<DispatchResult>((_, rej) => { reject = rej; }));
    open({ autoLockOnCatch: false, dispatch });

    const toggle = screen.getByRole('button', { name: '낚을 때 자동 잠금' }) as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(toggle.disabled).toBe(true);

    const boom = new Error('rate-limited');
    const caught = new Promise<unknown>(resolve => {
      process.once('unhandledRejection', reason => { resolve(reason); });
    });

    await act(async () => {
      reject(boom);
      expect(await caught).toBe(boom);
    });

    expect(toggle.disabled).toBe(false);
    // 가드 해제 후 다시 클릭하면 재요청이 나간다
    dispatch.mockImplementationOnce(() => ({ status: 'ok' as const }) as never);
    fireEvent.click(toggle);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});

describe('SettingsModal — 주요 알림 플로팅 토스트 설정', () => {
  it('기본값 켜짐으로 표시되고 클릭 시 localStorage에 저장된다(브라우저 알림 권한과 무관)', () => {
    open();
    const toggle = screen.getByRole('button', { name: '주요 알림 플로팅 토스트' });
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveTextContent('켜짐');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveTextContent('꺼짐');
    expect(localStorage.getItem('pf-toast-enabled')).toBe('0');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('pf-toast-enabled')).toBe('1');
  });
});
