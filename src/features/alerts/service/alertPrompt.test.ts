import { StrictMode, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { resetAlerts, setAlertEnabled } from '../../../platform/api/attention';
import { resetAlertPrompt, useAlertPrompt } from './alertPrompt';

// 플레이어의 대답(answer)은 요청이 끝난 뒤에야 권한 상태가 된다
class FakeNotification {
  static permission: NotificationPermission = 'default';
  static answer: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => (FakeNotification.permission = FakeNotification.answer));
}

beforeEach(() => {
  localStorage.clear();
  resetAlerts();
  resetAlertPrompt();
  FakeNotification.permission = 'default';
  FakeNotification.answer = 'default';
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal('Notification', FakeNotification);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); }); // 열어 둔 훅이 다음 케이스의 세션을 건드리지 않게 한다

const mount = (props = { ready: true, suspended: false }) => renderHook((p) => useAlertPrompt(p), { initialProps: props });
const stored = () => ['pf-encounter-alert', 'pf-bag-full-alert', 'pf-update-alert'].map(k => localStorage.getItem(k));

describe('안내 카드를 띄우는 때', () => {
  it('권한을 묻지 않았고 본 적 없고 끈 알림이 없으면 띄운다 - 처음에는 세 알림이 모두 켜져 있다', () => {
    const { result } = mount();
    expect(result.current.open).toBe(true);
    expect(result.current.picks).toEqual({ encounter: true, bag: true, update: true });
    expect(localStorage.getItem('pf-alert-prompt-seen')).toBe('on');
  });

  it('페이지를 열 때 권한을 요청하지 않는다', () => {
    mount();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('세이브가 준비되기 전에는 띄우지 않고, 준비되면 띄운다', () => {
    const { result, rerender } = mount({ ready: false, suspended: false });
    expect(result.current.open).toBe(false);
    rerender({ ready: true, suspended: false });
    expect(result.current.open).toBe(true);
  });

  it('다른 첫 접속 창이 있으면 그 창들이 닫힌 뒤에 띄운다', () => {
    const { result, rerender } = mount({ ready: true, suspended: true });
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem('pf-alert-prompt-seen')).toBeNull();
    rerender({ ready: true, suspended: false });
    expect(result.current.open).toBe(true);
  });

  it.each(['granted', 'denied'] as const)('권한이 %s면 띄우지 않는다', permission => {
    FakeNotification.permission = permission;
    expect(mount().result.current.open).toBe(false);
  });

  it('지원하지 않는 브라우저에서는 띄우지 않는다', () => {
    vi.stubGlobal('Notification', undefined);
    expect(mount().result.current.open).toBe(false);
  });

  it('본 적이 있으면 띄우지 않는다', () => {
    localStorage.setItem('pf-alert-prompt-seen', 'on');
    expect(mount().result.current.open).toBe(false);
  });

  it('알림을 직접 끈 적이 있으면 띄우지 않는다', () => {
    setAlertEnabled('bag', false);
    expect(mount().result.current.open).toBe(false);
  });

  it('한 번 띄운 뒤 다시 접속해도 띄우지 않는다', () => {
    mount().unmount();
    resetAlertPrompt(); // 새로 접속한 것과 같다 - 본 기록은 기기에 남아 있다
    expect(mount().result.current.open).toBe(false);
  });

  it('React StrictMode 이중 마운트에서도 두 번째 실행이 open을 done으로 덮어쓰지 않는다', () => {
    const { result } = renderHook(p => useAlertPrompt(p), {
      initialProps: { ready: true, suspended: false },
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });
    expect(result.current.open).toBe(true);
    expect(localStorage.getItem('pf-alert-prompt-seen')).toBe('on');
  });
});

describe('안내 카드 동작', () => {
  it('나중에는 세 알림을 모두 끄고 닫는다 - 권한은 묻지 않는다', () => {
    const { result } = mount();
    act(() => result.current.later());
    expect(result.current.open).toBe(false);
    expect(stored()).toEqual(['off', 'off', 'off']);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('항목을 눌러 켜고 끈다', () => {
    const { result } = mount();
    act(() => result.current.toggle('bag'));
    expect(result.current.picks.bag).toBe(false);
    act(() => result.current.toggle('bag'));
    expect(result.current.picks.bag).toBe(true);
  });

  it('허용은 켠 알림만 켜고 끈 알림은 끈 채 저장하고, 그 클릭 안에서 권한을 한 번 묻는다', async () => {
    const { result } = mount();
    act(() => result.current.toggle('bag'));
    FakeNotification.answer = 'granted';
    let permission;
    await act(async () => {
      const pending = result.current.allow();
      expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1); // await 앞에서 이미 물었다
      permission = await pending;
    });
    expect(permission).toBe('granted');
    expect(stored()).toEqual(['on', 'off', 'on']);
    expect(result.current.open).toBe(false);
  });

  it('세 알림을 모두 끄면 허용을 누를 수 없다 - 눌러도 권한을 묻지 않고 저장하지 않는다', async () => {
    const { result } = mount();
    act(() => { result.current.toggle('encounter'); result.current.toggle('bag'); result.current.toggle('update'); });
    expect(result.current.canAllow).toBe(false);
    await act(async () => { await result.current.allow(); });
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    expect(stored()).toEqual([null, null, null]);
    expect(result.current.open).toBe(true);
  });

  it('권한이 거절되면 거절 상태를 돌려주고 localStorage 알림 설정을 off로 맞춘다', async () => {
    const { result } = mount();
    FakeNotification.answer = 'denied';
    let permission;
    await act(async () => { permission = await result.current.allow(); });
    expect(permission).toBe('denied');
    expect(stored()).toEqual(['off', 'off', 'off']);
  });
});
