import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { resetAlerts, setAlertEnabled } from '../../../platform/api/attention';
import { useAlertSettings } from './alertSettings';

// 플레이어의 대답(answer)은 요청이 끝난 뒤에야 권한 상태가 된다
class FakeNotification {
  static permission: NotificationPermission = 'default';
  static answer: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => (FakeNotification.permission = FakeNotification.answer));
}

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
};

beforeEach(() => {
  localStorage.clear();
  resetAlerts();
  FakeNotification.permission = 'default';
  FakeNotification.answer = 'default';
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal('Notification', FakeNotification);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setHidden(false);
});

describe('useAlertSettings', () => {
  it('기본값은 세 알림이 켜져 있는 것이고, 허용되기 전에는 실제로 알리지 않는다', () => {
    const { result } = renderHook(() => useAlertSettings());
    expect(result.current.encounter.on && result.current.bag.on && result.current.update.on).toBe(true);
    expect(result.current.encounter.active).toBe(false);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('허용된 상태에서는 저장된 선택이 곧 실제 알림이다', () => {
    FakeNotification.permission = 'granted';
    setAlertEnabled('bag', false);
    const { result } = renderHook(() => useAlertSettings());
    expect(result.current.encounter.active).toBe(true);
    expect(result.current.bag.active).toBe(false);
  });

  it('설정 허용 버튼은 권한을 한 번 묻고, 허용되면 세 알림을 모두 켠다 - 꺼 둔 알림도 켠다', async () => {
    setAlertEnabled('encounter', false);
    setAlertEnabled('bag', false);
    setAlertEnabled('update', false);
    const { result } = renderHook(() => useAlertSettings());
    FakeNotification.answer = 'granted';
    await act(async () => { expect(await result.current.allowAll()).toBe('granted'); });
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(result.current.permission).toBe('granted');
    expect([result.current.encounter.on, result.current.bag.on, result.current.update.on]).toEqual([true, true, true]);
    expect(localStorage.getItem('pf-bag-full-alert')).toBe('on');
  });

  it('설정 허용 버튼에서 거절되면 저장된 선택을 건드리지 않고 거절 상태를 알린다', async () => {
    setAlertEnabled('bag', false);
    const { result } = renderHook(() => useAlertSettings());
    FakeNotification.answer = 'denied';
    await act(async () => { expect(await result.current.allowAll()).toBe('denied'); });
    expect(result.current.permission).toBe('denied');
    expect(result.current.bag.on).toBe(false);
    expect(result.current.encounter.on).toBe(true);
  });

  it('브라우저 설정에서 권한을 바꾸고 게임 화면으로 돌아오면 다시 읽어 반영한다', () => {
    const { result } = renderHook(() => useAlertSettings());
    expect(result.current.permission).toBe('default');
    FakeNotification.permission = 'granted';
    setHidden(true);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.permission).toBe('default');
    setHidden(false);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.permission).toBe('granted');
  });

  it('끄면 그 알림만 꺼진다', () => {
    FakeNotification.permission = 'granted';
    const { result } = renderHook(() => useAlertSettings());
    act(() => result.current.bag.disable());
    expect(result.current.bag.on).toBe(false);
    expect(result.current.encounter.on).toBe(true);
    expect(result.current.update.on).toBe(true);
  });

  it('권한이 거절된 채 켜려 하면 켜지 않는다', async () => {
    FakeNotification.permission = 'denied';
    setAlertEnabled('update', false);
    const { result } = renderHook(() => useAlertSettings());
    await act(async () => { expect(await result.current.update.enable()).toBe(false); });
    expect(result.current.update.on).toBe(false);
  });

  it('지원하지 않는 브라우저는 unsupported다', () => {
    vi.stubGlobal('Notification', undefined);
    const { result } = renderHook(() => useAlertSettings());
    expect(result.current.permission).toBe('unsupported');
  });
});
