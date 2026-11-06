import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { resetEncounterAlert, resetUpdateAlert } from '../../../platform/api/attention';
import { useAlertSettings, useEncounterAlertSetting } from './encounterAlert';

class FakeNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => FakeNotification.permission);
}

beforeEach(() => {
  localStorage.clear();
  resetEncounterAlert();
  resetUpdateAlert();
  FakeNotification.permission = 'default';
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal('Notification', FakeNotification);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('useAlertSettings', () => {
  it('권한이 없으면 켤 때 한 번 묻고, 허용되면 켠 쪽만 켜진다', async () => {
    FakeNotification.permission = 'granted';
    const { result } = renderHook(() => useAlertSettings());
    expect(result.current.encounter.active).toBe(false);
    await act(async () => { expect(await result.current.update.enable()).toBe(true); });
    expect(result.current.update.active).toBe(true);
    expect(result.current.encounter.active).toBe(false);
    expect(localStorage.getItem('pf-update-alert')).toBe('on');
  });

  it('거절되면 켜지 않고 두 알림이 함께 막힌 상태가 된다', async () => {
    FakeNotification.permission = 'denied';
    const { result } = renderHook(() => useAlertSettings());
    await act(async () => { expect(await result.current.encounter.enable()).toBe(false); });
    expect(result.current.encounter.active).toBe(false);
    expect(result.current.permission).toBe('denied');
    await act(async () => { expect(await result.current.update.enable()).toBe(false); });
    expect(result.current.update.active).toBe(false);
  });

  it('끄면 그 알림만 꺼진다', async () => {
    FakeNotification.permission = 'granted';
    const { result } = renderHook(() => useAlertSettings());
    await act(async () => { await result.current.encounter.enable(); await result.current.update.enable(); });
    act(() => result.current.update.disable());
    expect(result.current.update.active).toBe(false);
    expect(result.current.encounter.active).toBe(true);
  });

  it('지원하지 않는 브라우저는 unsupported다', () => {
    vi.stubGlobal('Notification', undefined);
    const { result } = renderHook(() => useAlertSettings());
    expect(result.current.permission).toBe('unsupported');
  });
});

describe('useEncounterAlertSetting', () => {
  it('수배판용 훅은 네임드 알림만 바꾼다', async () => {
    FakeNotification.permission = 'granted';
    const both = renderHook(() => useAlertSettings());
    const { result } = renderHook(() => useEncounterAlertSetting());
    await act(async () => { await result.current.enable(); });
    expect(result.current.active).toBe(true);
    expect(both.result.current.update.active).toBe(false);
  });
});
