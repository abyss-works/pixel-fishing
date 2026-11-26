import type { AlertKind, NotificationPermissionState } from '../../../platform/api/attention';

export type { AlertKind, NotificationPermissionState } from '../../../platform/api/attention';

/** 세 알림의 순서 — 게임 안 요소에서 바깥 요소 순이다. 안내 카드, 설정 창, 어디서든 세 알림을 나열할 때 이 순서를 쓴다 */
export const ALERT_ORDER: readonly AlertKind[] = ['encounter', 'bag', 'update'];

/** 종류별 문구 — prompt는 안내 카드 항목, label과 hint는 설정 창 줄, flash는 탭 제목 깜빡임 */
export const ALERT_COPY: Record<AlertKind, { prompt: string; label: string; hint: string; flash: string }> = {
  encounter: { prompt: '네임드와 조우했을 때', label: '네임드 조우', hint: '네임드의 흔적을 만나면 알려 줘요.', flash: '흔적 발견' },
  bag: { prompt: '가방이 가득 찼을 때', label: '가방 가득 참', hint: '가방이 가득 차면 알려 줘요.', flash: '가방 가득 참' },
  update: { prompt: '업데이트가 나왔을 때', label: '업데이트', hint: '업데이트가 나와 진행이 멈추면 알려 줘요.', flash: '업데이트' },
};

export const BAG_FULL_NOTIFICATION = { title: '가방 가득 참', body: '가방이 가득 찼어요. 돌아와서 가방을 비워 주세요.' } as const;

export const PERMISSION_TIP = '브라우저에서 알림을 허용했는지 보여 줘요.';
export const PERMISSION_LABEL: Record<NotificationPermissionState, string> = {
  granted: '허용됨', default: '허용 전', denied: '차단됨', unsupported: '지원 안 함',
};
/** 권한이 막혀 알림을 켜고 끌 수 없을 때의 이유 — 문장마다 한 줄이다. 허용 전은 허용 버튼이 길이라 이유를 두지 않는다 */
export const PERMISSION_BLOCK_LINES: Partial<Record<NotificationPermissionState, readonly string[]>> = {
  denied: [
    '브라우저가 이 사이트의 알림을 막았어요.',
    '주소창 왼쪽의 사이트 설정에서 알림을 허용하면 켤 수 있어요.',
    '그동안은 탭 제목 깜빡임으로 알려 줘요.',
  ],
  unsupported: ['이 브라우저는 알림을 지원하지 않아요.', '대신 탭 제목 깜빡임으로 알려 줘요.'],
};

/** 권한 요청이 거절됐을 때 메시지 줄에 남기는 안내 */
export const ALERT_DENIED_TEXT = '브라우저가 알림을 막았어요. 주소창의 사이트 설정에서 허용할 수 있어요.';
export const ALERT_DENIED_TOAST = '브라우저 알림이 막혀 있어요.';

/** 알림을 어떻게 알릴지 — 화면을 보고 있으면 토스트와 카드로 충분하다.
 *  다른 화면을 보고 있으면 탭 제목을 깜빡이고, 알림을 켜고 허용했을 때만 시스템 알림을 더한다. */
export function planAlert({ pageHidden, enabled, permission }: {
  pageHidden: boolean; enabled: boolean; permission: NotificationPermissionState;
}): { flash: boolean; notify: boolean } {
  if (!pageHidden) return { flash: false, notify: false };
  return { flash: true, notify: enabled && permission === 'granted' };
}

/** 안내 카드를 띄울지 — 권한을 아직 묻지 않았고(default), 본 적이 없고, 직접 끈 알림이 없을 때만 한 번 띄운다 */
export function shouldShowAlertPrompt({ permission, seen, offs }: {
  permission: NotificationPermissionState; seen: boolean; offs: number;
}): boolean {
  return permission === 'default' && !seen && offs === 0;
}

/** 카드의 허용 버튼 — 켠 알림이 하나도 없으면 권한만 묻는 꼴이라 누를 수 없다 */
export function canAllowPrompt(picks: Record<AlertKind, boolean>): boolean {
  return ALERT_ORDER.some(kind => picks[kind]);
}

/** 가방 가득 참을 알릴 순간 — 자리를 비운 동안 가득 차는 때 한 번이고, 게임 화면으로 돌아오기 전까지 다시 알리지 않는다 */
export function shouldAlertBagFull({ wasFull, full, pageHidden, alreadyAlerted }: {
  wasFull: boolean; full: boolean; pageHidden: boolean; alreadyAlerted: boolean;
}): boolean {
  return pageHidden && full && !wasFull && !alreadyAlerted;
}
