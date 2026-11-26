// 주의 끌기 어댑터 — 시스템 알림(Notification API)·탭 제목 깜빡임·알림 선호(localStorage).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALERT_KEYS, ALERT_PROMPT_SEEN_KEY, flashTitle, getAlertEnabled, isAlertPromptSeen, isPageHidden, loadAlertEnabled,
  markAlertPromptSeen, notificationPermission, requestNotificationPermission, resetAlerts, setAlertEnabled,
  showNotification, subscribeAlert, subscribePermission,
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
    resetAlerts();
  });

  it('저장값이 없으면 세 알림 모두 켜져 있다', () => {
    for (const kind of ['encounter', 'bag', 'update'] as const) {
      expect(loadAlertEnabled(kind)).toBe(true);
      expect(getAlertEnabled(kind)).toBe(true);
    }
  });

  it('off로 저장된 알림만 꺼짐이다 — 알 수 없는 값은 켜짐으로 본다', () => {
    localStorage.setItem(ALERT_KEYS.bag, 'off');
    localStorage.setItem(ALERT_KEYS.encounter, 'garbage');
    expect(loadAlertEnabled('bag')).toBe(false);
    expect(loadAlertEnabled('encounter')).toBe(true);
  });

  it('끄면 기기에 남고 구독자에게 알린다 — 같은 값으로 다시 바꿔도 알리지 않는다', () => {
    let calls = 0;
    const off = subscribeAlert('bag', () => { calls++; });
    setAlertEnabled('bag', false);
    expect(localStorage.getItem(ALERT_KEYS.bag)).toBe('off');
    expect(loadAlertEnabled('bag')).toBe(false);
    setAlertEnabled('bag', false);
    expect(calls).toBe(1);
    setAlertEnabled('bag', true);
    expect(localStorage.getItem(ALERT_KEYS.bag)).toBe('on');
    off();
  });

  it('한 알림을 바꿔도 다른 알림은 그대로다', () => {
    setAlertEnabled('bag', false);
    expect(getAlertEnabled('encounter')).toBe(true);
    expect(getAlertEnabled('update')).toBe(true);
  });
});

describe('업데이트 알림 선호', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAlerts();
  });

  it('업데이트 키가 없으면 네임드 키 값을 따른다 — 키가 둘 다 없으면 켜짐', () => {
    expect(loadAlertEnabled('update')).toBe(true);
    localStorage.setItem(ALERT_KEYS.encounter, 'off');
    expect(loadAlertEnabled('update')).toBe(false);
    localStorage.setItem(ALERT_KEYS.encounter, 'on');
    expect(loadAlertEnabled('update')).toBe(true);
  });

  it('업데이트 키가 있으면 네임드 키와 무관하게 그 값을 쓴다', () => {
    localStorage.setItem(ALERT_KEYS.encounter, 'on');
    localStorage.setItem(ALERT_KEYS.update, 'off');
    expect(loadAlertEnabled('update')).toBe(false);
    localStorage.setItem(ALERT_KEYS.encounter, 'off');
    localStorage.setItem(ALERT_KEYS.update, 'on');
    expect(loadAlertEnabled('update')).toBe(true);
  });

  it('업데이트 알림을 바꿔도 네임드 알림은 그대로다', () => {
    setAlertEnabled('update', false);
    expect(getAlertEnabled('encounter')).toBe(true);
    expect(localStorage.getItem(ALERT_KEYS.update)).toBe('off');
    expect(localStorage.getItem(ALERT_KEYS.encounter)).toBeNull();
  });

  it('네임드 알림을 바꿔도 업데이트 알림은 그대로다', () => {
    setAlertEnabled('encounter', false);
    setAlertEnabled('encounter', true);
    expect(getAlertEnabled('update')).toBe(true);
    expect(loadAlertEnabled('update')).toBe(true);
  });

  it('업데이트 키가 없는 채로 네임드 알림을 바꾸면, 업데이트의 현재 값을 먼저 저장해 이후 로드에서 끌려가지 않는다', () => {
    expect(localStorage.getItem(ALERT_KEYS.update)).toBeNull();
    setAlertEnabled('encounter', false);
    expect(localStorage.getItem(ALERT_KEYS.update)).toBe('on');
    expect(loadAlertEnabled('update')).toBe(true);
  });
});

describe('안내 카드를 본 기록', () => {
  beforeEach(() => { localStorage.clear(); });

  it('기록이 없으면 본 적이 없고, 남기면 본 것으로 읽힌다', () => {
    expect(isAlertPromptSeen()).toBe(false);
    markAlertPromptSeen();
    expect(localStorage.getItem(ALERT_PROMPT_SEEN_KEY)).toBe('on');
    expect(isAlertPromptSeen()).toBe(true);
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

  it('권한을 요청하면 구독자에게 알린다', async () => {
    let calls = 0;
    const off = subscribePermission(() => { calls++; });
    FakeNotification.permission = 'granted';
    await requestNotificationPermission();
    expect(calls).toBe(1);
    off();
  });

  it('게임 화면으로 돌아오면 권한 상태를 다시 읽도록 구독자에게 알린다 — 숨겨지는 때는 알리지 않는다', () => {
    let calls = 0;
    const off = subscribePermission(() => { calls++; });
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(calls).toBe(0);
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(calls).toBe(1);
    off();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(calls).toBe(1);
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
