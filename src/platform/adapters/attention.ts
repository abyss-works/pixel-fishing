// 주의 끌기 — 게임 창을 보고 있지 않은 플레이어에게 일이 생겼음을 알리는 브라우저 기능.
// 시스템 알림(Notification API)은 권한이 필요하고, 탭 제목 깜빡임은 권한 없이 동작한다.
// 알림 선호는 기기별 설정(localStorage)이라 세이브·서버 권위 대상이 아니다.

export type AlertKind = 'encounter' | 'bag' | 'update';

export const ALERT_KEYS: Record<AlertKind, string> = {
  encounter: 'pf-encounter-alert',
  bag: 'pf-bag-full-alert',
  update: 'pf-update-alert',
};
export const ALERT_PROMPT_SEEN_KEY = 'pf-alert-prompt-seen';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

function readKey(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null; // 저장소 접근이 막힌 환경
  }
}

function writeKey(key: string, value: 'on' | 'off'): void {
  try { localStorage.setItem(key, value); } catch { /* 이번 세션에만 적용 */ }
}

/** 저장소에서 다시 읽는다 — 키가 없으면 켜짐이고 off로 저장된 알림만 꺼짐이다.
 *  업데이트 알림은 두 알림이 한 스위치였던 때의 선택을 이어받는다 — 자기 키가 없으면 네임드 키 값을 따른다 */
export function loadAlertEnabled(kind: AlertKind): boolean {
  const own = readKey(ALERT_KEYS[kind]);
  return (kind === 'update' ? own ?? readKey(ALERT_KEYS.encounter) : own) !== 'off';
}

const enabled: Record<AlertKind, boolean> = {
  encounter: loadAlertEnabled('encounter'),
  bag: loadAlertEnabled('bag'),
  update: loadAlertEnabled('update'),
};
const alertListeners: Record<AlertKind, Set<() => void>> = { encounter: new Set(), bag: new Set(), update: new Set() };

function notify(listeners: Set<() => void>) {
  for (const listener of listeners) listener();
}

export function getAlertEnabled(kind: AlertKind): boolean {
  return enabled[kind];
}

/** 선택을 기기에 남긴다 — 같은 값이어도 키를 적어 둔다(안내 카드에서 켠 알림이 `on`으로 저장돼야 한다) */
export function setAlertEnabled(kind: AlertKind, next: boolean): void {
  // 업데이트 키가 아직 없으면 이어받은 값을 먼저 굳힌다. 안 그러면 다음 로드에서 바뀐 네임드 값을 따라간다
  if (kind === 'encounter' && readKey(ALERT_KEYS.update) === null) writeKey(ALERT_KEYS.update, enabled.update ? 'on' : 'off');
  writeKey(ALERT_KEYS[kind], next ? 'on' : 'off');
  if (enabled[kind] === next) return;
  enabled[kind] = next;
  notify(alertListeners[kind]);
}

export function subscribeAlert(kind: AlertKind, listener: () => void): () => void {
  alertListeners[kind].add(listener);
  return () => { alertListeners[kind].delete(listener); };
}

/** 테스트 격리용 — 메모리 값을 기본(켜짐)으로 되돌린다(저장소는 건드리지 않는다) */
export function resetAlerts(): void {
  for (const kind of Object.keys(enabled) as AlertKind[]) {
    if (enabled[kind]) continue;
    enabled[kind] = true;
    notify(alertListeners[kind]);
  }
}

/** 권한 안내 카드를 본 적이 있는지 — 카드는 기기마다 한 번만 띄운다 */
export function isAlertPromptSeen(): boolean {
  return readKey(ALERT_PROMPT_SEEN_KEY) === 'on';
}

export function markAlertPromptSeen(): void {
  writeKey(ALERT_PROMPT_SEEN_KEY, 'on');
}

const notificationApi = (): typeof Notification | undefined =>
  typeof Notification === 'undefined' ? undefined : Notification;

export function notificationPermission(): NotificationPermissionState {
  return notificationApi()?.permission ?? 'unsupported';
}

const permissionListeners = new Set<() => void>();
const notifyPermission = () => notify(permissionListeners);
const onReturn = () => { if (!document.hidden) notifyPermission(); };

/** 권한 상태가 바뀌었을 수 있는 때(요청이 끝났을 때, 게임 화면으로 돌아왔을 때) 알린다.
 *  플레이어가 브라우저 설정에서 권한을 바꾸면 이벤트 없이 값만 달라지므로 돌아올 때 다시 읽게 한다 */
export function subscribePermission(listener: () => void): () => void {
  if (permissionListeners.size === 0) {
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
  }
  permissionListeners.add(listener);
  return () => {
    permissionListeners.delete(listener);
    if (permissionListeners.size === 0) {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    }
  };
}

/** 권한 요청 — 브라우저는 클릭 같은 사용자 동작 안에서 부를 때만 묻는다 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const api = notificationApi();
  if (!api) return 'unsupported';
  try {
    return await api.requestPermission();
  } catch {
    return api.permission;
  } finally {
    notifyPermission();
  }
}

/** 시스템 알림 — 권한이 없으면 아무것도 하지 않는다. 누르면 게임 창으로 돌아온다 */
export function showNotification({ title, body, tag }: { title: string; body: string; tag: string }): void {
  const api = notificationApi();
  if (!api || api.permission !== 'granted') return;
  try {
    const notice = new api(title, { body, tag });
    notice.onclick = () => {
      window.focus();
      notice.close();
    };
  } catch { /* 생성자를 막는 환경(일부 모바일 브라우저) — 제목 깜빡임만 남는다 */ }
}

export function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

const FLASH_MS = 1000;
let flashing: { original: string; timer: ReturnType<typeof setInterval> } | null = null;

function stopFlash() {
  if (!flashing) return;
  clearInterval(flashing.timer);
  document.title = flashing.original;
  flashing = null;
  document.removeEventListener('visibilitychange', onVisibility);
}

function onVisibility() {
  if (!document.hidden) stopFlash();
}

/** 탭 제목 깜빡임 — 창을 다시 볼 때까지 원래 제목과 번갈아 보인다 */
export function flashTitle(text: string): void {
  if (typeof document === 'undefined') return;
  const original = flashing?.original ?? document.title;
  stopFlash();
  document.title = text;
  let showText = true;
  flashing = {
    original,
    timer: setInterval(() => {
      showText = !showText;
      document.title = showText ? text : original;
    }, FLASH_MS),
  };
  document.addEventListener('visibilitychange', onVisibility);
}
