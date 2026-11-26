import { useEffect, useSyncExternalStore } from 'react';
import {
  getAlertEnabled, isAlertPromptSeen, markAlertPromptSeen, notificationPermission, requestNotificationPermission, setAlertEnabled,
} from '../../../platform/api/attention';
import type { AlertKind, NotificationPermissionState } from '../../../platform/api/attention';
import { ALERT_ORDER, canAllowPrompt, shouldShowAlertPrompt } from '../model/alerts';

// 브라우저 알림 안내 카드의 세션 상태 - 접속 후 세이브가 준비되고 앞 차례 안내 창이 끝나면 한 번 판정한다.
interface Session {
  phase: 'waiting' | 'open' | 'done';
  picks: Record<AlertKind, boolean>;
}

const INITIAL: Session = { phase: 'waiting', picks: { encounter: true, bag: true, update: true } };
let session = INITIAL;
const listeners = new Set<() => void>();

function update(next: Session) {
  session = next;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getSession = () => session;

function evaluate() {
  const show = shouldShowAlertPrompt({
    permission: notificationPermission(),
    seen: isAlertPromptSeen(),
    offs: ALERT_ORDER.filter(kind => !getAlertEnabled(kind)).length,
  });
  if (show) markAlertPromptSeen(); // 카드는 기기마다 한 번만 띄운다 - 답하지 않고 닫아도 다시 뜨지 않는다
  update({ ...session, phase: show ? 'open' : 'done' });
}

/** 나중에와 닫기 X - 세 알림을 모두 끈다 */
function later() {
  for (const kind of ALERT_ORDER) setAlertEnabled(kind, false);
  update({ ...session, phase: 'done' });
}

/** 허용 - 켠 알림만 켜고 끈 알림은 끈 채 저장하고, 이 클릭 안에서 권한을 묻는다. 요청 뒤의 권한 상태를 돌려준다 */
function allow(): Promise<NotificationPermissionState> {
  if (!canAllowPrompt(session.picks)) return Promise.resolve(notificationPermission());
  for (const kind of ALERT_ORDER) setAlertEnabled(kind, session.picks[kind]);
  const result = requestNotificationPermission();
  update({ ...session, phase: 'done' });
  return result;
}

function toggle(kind: AlertKind) {
  update({ ...session, picks: { ...session.picks, [kind]: !session.picks[kind] } });
}

/**
 * 안내 카드의 현재 상태와 동작. 권한 요청은 허용 버튼을 누르는 클릭 안에서만 한다(여는 때에는 묻지 않는다).
 * @param ready 세이브가 준비됐는지
 * @param suspended 먼저 뜰 다른 안내 창이 남아 있으면 참 - 끝난 뒤에 판정한다
 */
export function useAlertPrompt({ ready, suspended }: { ready: boolean; suspended: boolean }) {
  const s = useSyncExternalStore(subscribe, getSession, getSession);
  useEffect(() => {
    if (s.phase === 'waiting' && ready && !suspended) evaluate();
  }, [s.phase, ready, suspended]);
  return { open: s.phase === 'open', picks: s.picks, canAllow: canAllowPrompt(s.picks), toggle, later, allow };
}

/** 테스트 격리용 - 세션을 처음으로 되돌린다 */
export function resetAlertPrompt(): void {
  update(INITIAL);
}
