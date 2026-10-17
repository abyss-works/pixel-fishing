// 메시지 피드 — HUD 메시지 창이 보여 주는 기록의 형식과 보관 규칙(순수 함수).
// 지금은 시스템 메시지 채널 하나다. 멀티플레이 채팅은 채널(MessageChannel)과 보낸 사람(author)을
// 더하는 것으로 들어온다 — 글줄마다 [채널] 머리표가 붙고, 창은 채널이 둘 이상일 때만 채널 탭을 그린다.

export type MessageChannel = 'system';
export type MessageTone = 'info' | 'gold' | 'warn';

export interface Msg {
  id: number;
  /** 표시용 시각 HH:MM */
  ts: string;
  text: string;
  tone: MessageTone;
  channel: MessageChannel;
  /** 보낸 사람 — 시스템 메시지는 없다 */
  author?: string;
}

/** 채널 표시 이름 — 글줄 앞 [채널] 머리표와 채널 탭 라벨 */
export const CHANNEL_LABEL: Record<MessageChannel, string> = { system: '시스템' };

/** 보관 상한 — 넘으면 오래된 것부터 버린다(긴 세션에서 기록이 끝없이 쌓이지 않게) */
export const MESSAGE_KEEP = 200;

/** 메시지 창 높이 — 한 번에 보이는 줄 수. 그 위는 휠로 거슬러 본다 */
export const MESSAGE_VISIBLE_LINES = 8;

// 톤 분류 — 명시 tone이 우선이고, 없으면 키워드로 추정한다.
// 문구가 바뀌면 추정이 어긋나므로 새 메시지는 tone을 명시한다.
export function classifyTone(text: string): MessageTone {
  if (/부족하다|올바르지|없는 쿠폰|실패|거부|끊겨|않아요/.test(text)) return 'warn';
  if (/PERFECT|획득|구매|벌었다|해금|열렸다|쿠폰 사용|달성/.test(text)) return 'gold';
  return 'info';
}

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function createMessage(id: number, text: string, opts: {
  tone?: MessageTone; channel?: MessageChannel; author?: string; now?: Date;
} = {}): Msg {
  return {
    id, ts: hhmm(opts.now ?? new Date()), text,
    tone: opts.tone ?? classifyTone(text),
    channel: opts.channel ?? 'system',
    ...(opts.author ? { author: opts.author } : {}),
  };
}

/** 기록 끝에 덧붙이고 보관 상한을 넘는 오래된 메시지를 버린다 */
export function appendMessage(list: readonly Msg[], msg: Msg, keep = MESSAGE_KEEP): Msg[] {
  const next = [...list, msg];
  return next.length > keep ? next.slice(next.length - keep) : next;
}

/** 기록에 나타난 채널 — 등장 순서대로, 중복 없이 */
export function channelsOf(list: readonly Msg[]): MessageChannel[] {
  return [...new Set(list.map(m => m.channel))];
}
