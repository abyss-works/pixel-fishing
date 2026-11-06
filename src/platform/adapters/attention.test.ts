// 주의 끌기 어댑터 — 시스템 알림(Notification API)·탭 제목 깜빡임·알림 선호(localStorage).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENCOUNTER_ALERT_KEY, UPDATE_ALERT_KEY, flashTitle, getEncounterAlertEnabled, getUpdateAlertEnabled, isPageHidden,
  loadEncounterAlertEnabled, loadUpdateAlertEnabled, notificationPermission, requestNotificationPermission,
  resetEncounterAlert, resetUpdateAlert, setEncounterAlertEnabled, setUpdateAlertEnabled,
  showNotification, subscribeEncounterAlert, subscribeUpdateAlert,
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

describe('업데이트 알림 선호', () => {
  beforeEach(() => {
    localStorage.clear();
    resetEncounterAlert();
    resetUpdateAlert();
  });

  it('저장값이 없으면 꺼져 있다', () => {
    expect(loadUpdateAlertEnabled()).toBe(false);
  });

  it('업데이트 키가 없으면 네임드 키 값을 따른다', () => {
    localStorage.setItem(ENCOUNTER_ALERT_KEY, 'on');
    expect(loadUpdateAlertEnabled()).toBe(true);
    localStorage.setItem(ENCOUNTER_ALERT_KEY, 'off');
    expect(loadUpdateAlertEnabled()).toBe(false);
  });

  it('업데이트 키가 있으면 네임드 키와 무관하게 그 값을 쓴다', () => {
    localStorage.setItem(ENCOUNTER_ALERT_KEY, 'on');
    localStorage.setItem(UPDATE_ALERT_KEY, 'off');
    expect(loadUpdateAlertEnabled()).toBe(false);
    localStorage.setItem(ENCOUNTER_ALERT_KEY, 'off');
    localStorage.setItem(UPDATE_ALERT_KEY, 'on');
    expect(loadUpdateAlertEnabled()).toBe(true);
  });

  it('업데이트 알림을 바꿔도 네임드 알림은 그대로다', () => {
    setEncounterAlertEnabled(true);
    setUpdateAlertEnabled(false);
    expect(getEncounterAlertEnabled()).toBe(true);
    expect(getUpdateAlertEnabled()).toBe(false);
    expect(localStorage.getItem(UPDATE_ALERT_KEY)).toBe('off');
    expect(localStorage.getItem(ENCOUNTER_ALERT_KEY)).toBe('on');
  });

  it('네임드 알림을 바꿔도 업데이트 알림은 그대로다', () => {
    setUpdateAlertEnabled(true);
    setEncounterAlertEnabled(true);
    setEncounterAlertEnabled(false);
    expect(getUpdateAlertEnabled()).toBe(true);
    expect(loadUpdateAlertEnabled()).toBe(true);
  });

  it('업데이트 키가 없는 채로 네임드 알림을 바꾸면, 업데이트의 현재 값을 먼저 저장해 이후 로드에서 끌려가지 않는다', () => {
    expect(localStorage.getItem(UPDATE_ALERT_KEY)).toBeNull();
    setEncounterAlertEnabled(true);
    expect(localStorage.getItem(UPDATE_ALERT_KEY)).toBe('off');
    expect(loadUpdateAlertEnabled()).toBe(false);
  });

  it('구독자에게 알린다', () => {
    let calls = 0;
    const off = subscribeUpdateAlert(() => { calls++; });
    setUpdateAlertEnabled(true);
    setUpdateAlertEnabled(true);
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
