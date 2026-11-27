import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { resetAlerts } from '../../../platform/api/attention';
import { useAlertSettings } from '../../alerts/service/alertSettings';
import { useEncounterAlertSetting } from './encounterAlert';

// 플레이어의 대답(answer)은 요청이 끝난 뒤에야 권한 상태가 된다
class FakeNotification {
  static permission: NotificationPermission = 'default';
  static answer: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => (FakeNotification.permission = FakeNotification.answer));
}

beforeEach(() => {
  localStorage.clear();
  resetAlerts();
  FakeNotification.permission = 'default';
  FakeNotification.answer = 'default';
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal('Notification', FakeNotification);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('useEncounterAlertSetting', () => {
  it('수배판용 훅은 네임드 알림만 바꾼다', async () => {
    FakeNotification.permission = 'granted';
    const both = renderHook(() => useAlertSettings());
    const { result } = renderHook(() => useEncounterAlertSetting());
    await act(async () => { await result.current.disable(); });
    expect(result.current.active).toBe(false);
    await act(async () => { expect(await result.current.enable()).toBe(true); });
    expect(result.current.active).toBe(true);
    expect(both.result.current.update.on).toBe(true);
    expect(localStorage.getItem('pf-update-alert')).toBe('on');
  });

  it('권한이 없으면 켜는 클릭에서 한 번 묻고, 거절되면 켜지 않는다', async () => {
    FakeNotification.answer = 'denied';
    const { result } = renderHook(() => useEncounterAlertSetting());
    await act(async () => { expect(await result.current.enable()).toBe(false); });
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(result.current.on).toBe(false);
    expect(result.current.permission).toBe('denied');
  });
});
