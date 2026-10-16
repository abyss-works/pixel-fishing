// 주의 끌기 어댑터 — 시스템 알림(Notification API)·탭 제목 깜빡임·알림 선호(localStorage).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENCOUNTER_ALERT_KEY, flashTitle, getEncounterAlertEnabled, isPageHidden, loadEncounterAlertEnabled,
  notificationPermission, requestNotificationPermission, resetEncounterAlert, setEncounterAlertEnabled,
  showNotification, subscribeEncounterAlert,
} from './attention';

class FakeNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  static created: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  close = vi.fn();
  title: string;
  options: NotificationOptions;
  constructor(title: string, options: NotificationOptions) {
    this.title = title;
    this.options = options;
    FakeNotification.created.push(this);
  }
}

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
};

describe('알림 선호 저장소', () => {
  beforeEach(() => {
    localStorage.clear();
    resetEncounterAlert();
  });

  it('저장값이 없으면 꺼져 있다 — 권한을 묻기 전에는 알리지 않는다', () => {
    expect(loadEncounterAlertEnabled()).toBe(false);
    expect(getEncounterAlertEnabled()).toBe(false);
  });

  it('켜면 기기에 남고 구독자에게 알린다', () => {
    let calls = 0;
    const off = subscribeEncounterAlert(() => { calls++; });
    setEncounterAlertEnabled(true);
    expect(localStorage.getItem(ENCOUNTER_ALERT_KEY)).toBe('on');
    expect(loadEncounterAlertEnabled()).toBe(true);
    setEncounterAlertEnabled(true);
    expect(calls).toBe(1);
    off();
  });
});

describe('시스템 알림', () => {
  beforeEach(() => {
    FakeNotification.permission = 'default';
    FakeNotification.created = [];
    FakeNotification.requestPermission.mockClear();
    vi.stubGlobal('Notification', FakeNotification);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('지원하지 않는 브라우저는 unsupported다', () => {
    vi.stubGlobal('Notification', undefined);
    expect(notificationPermission()).toBe('unsupported');
  });

  it('권한 상태를 그대로 읽고, 요청 결과를 돌려준다', async () => {
    expect(notificationPermission()).toBe('default');
    FakeNotification.permission = 'granted';
    expect(await requestNotificationPermission()).toBe('granted');
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('허용된 경우에만 띄우고, 누르면 게임 창으로 돌아온다', () => {
    showNotification({ title: 't', body: 'b', tag: 'x' });
    expect(FakeNotification.created).toHaveLength(0);
    FakeNotification.permission = 'granted';
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    showNotification({ title: 't', body: 'b', tag: 'x' });
    expect(FakeNotification.created).toHaveLength(1);
    expect(FakeNotification.created[0].options).toMatchObject({ body: 'b', tag: 'x' });
    FakeNotification.created[0].onclick?.();
    expect(focus).toHaveBeenCalled();
    expect(FakeNotification.created[0].close).toHaveBeenCalled();
  });
});

describe('탭 제목 깜빡임', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.title = '픽셀 낚시';
    setHidden(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
  });

  it('숨김 여부를 읽는다', () => {
    expect(isPageHidden()).toBe(true);
  });

  it('창을 다시 볼 때까지 원래 제목과 번갈아 보이고, 돌아오면 원래 제목으로 되돌린다', () => {
    flashTitle('흔적 발견!');
    expect(document.title).toBe('흔적 발견!');
    vi.advanceTimersByTime(1000);
    expect(document.title).toBe('픽셀 낚시');
    vi.advanceTimersByTime(1000);
    expect(document.title).toBe('흔적 발견!');
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.title).toBe('픽셀 낚시');
    vi.advanceTimersByTime(3000);
    expect(document.title).toBe('픽셀 낚시');
  });

  it('깜빡이는 중에 다시 불러도 원래 제목을 잃지 않는다', () => {
    flashTitle('흔적 발견!');
    flashTitle('흔적 발견!');
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.title).toBe('픽셀 낚시');
  });
});
