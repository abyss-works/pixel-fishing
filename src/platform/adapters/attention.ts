// 주의 끌기 — 게임 창을 보고 있지 않은 플레이어에게 일이 생겼음을 알리는 브라우저 기능.
// 시스템 알림(Notification API)은 권한이 필요하고, 탭 제목 깜빡임은 권한 없이 동작한다.
// 알림 선호는 기기별 설정(localStorage)이라 세이브·서버 권위 대상이 아니다.

export const ENCOUNTER_ALERT_KEY = 'pf-encounter-alert';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

/** 저장소에서 다시 읽는다 — 시작 시 한 번, 테스트에서 저장값 해석을 검증할 때 쓴다 */
export function loadEncounterAlertEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(ENCOUNTER_ALERT_KEY) === 'on';
  } catch {
    return false; // 저장소 접근이 막힌 환경
  }
}

let enabled = loadEncounterAlertEnabled();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function getEncounterAlertEnabled(): boolean {
  return enabled;
}

export function setEncounterAlertEnabled(next: boolean): void {
  if (enabled === next) return;
  enabled = next;
  try { localStorage.setItem(ENCOUNTER_ALERT_KEY, next ? 'on' : 'off'); } catch { /* 이번 세션에만 적용 */ }
  notify();
}

export function subscribeEncounterAlert(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 테스트 격리용 — 메모리 값을 기본으로 되돌린다(저장소는 건드리지 않는다) */
export function resetEncounterAlert(): void {
  if (!enabled) return;
  enabled = false;
  notify();
}

const notificationApi = (): typeof Notification | undefined =>
  typeof Notification === 'undefined' ? undefined : Notification;

export function notificationPermission(): NotificationPermissionState {
  return notificationApi()?.permission ?? 'unsupported';
}

/** 권한 요청 — 브라우저는 클릭 같은 사용자 동작 안에서 부를 때만 묻는다 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const api = notificationApi();
  if (!api) return 'unsupported';
  try {
    return await api.requestPermission();
  } catch {
    return api.permission;
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
