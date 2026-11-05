// 메시지 피드 — HUD 메시지 창이 보여 주는 기록의 형식과 보관 규칙(순수 함수).
// 채널은 시스템 메시지와 채팅이다. 채팅 글줄은 보낸 사람(author)과 원본(from)을 가진다.
// 글줄마다 [채널] 머리표가 붙고, 창은 채널이 둘 이상일 때만 채널 토글(채팅·시스템)을 그린다.

export type MessageChannel = 'system' | 'chat';
export type MessageTone = 'info' | 'gold' | 'warn';

/** 메시지를 남기는 쪽이 받는 함수 — 톤은 부르는 쪽이 정한다(기본 info).
 *  보상 순간은 gold, 거부·실패는 warn을 넘긴다. 문구로 톤을 추정하지 않는다. */
export type Notify = (text: string, tone?: MessageTone) => void;

export interface Msg {
  id: number;
  /** 표시용 시각 HH:MM */
  ts: string;
  text: string;
  tone: MessageTone;
  channel: MessageChannel;
  /** 보낸 사람 — 시스템 메시지는 없다 */
  author?: string;
  /** 만든 시각(ms) — 채널이 다른 기록을 시간순으로 합칠 때 쓴다 */
  at: number;
  /** 채팅 글줄의 원본 — 보낸 사람 id와 채팅 id(신고·차단 대상) */
  from?: { uid: string; chatId: number };
}

/** 채널 표시 이름 — 글줄 앞 [채널] 머리표와 채널 토글 라벨 */
export const CHANNEL_LABEL: Record<MessageChannel, string> = { system: '시스템', chat: '채팅' };

/** 보관 상한 — 넘으면 오래된 것부터 버린다(긴 세션에서 기록이 끝없이 쌓이지 않게) */
export const MESSAGE_KEEP = 200;

/** 메시지 창 높이 — 한 번에 보이는 줄 수. 그 위는 휠로 거슬러 본다 */
export const MESSAGE_VISIBLE_LINES = 8;

/** 맨 아래로 보는 여유(px) — 이만큼 안쪽이면 맨 아래를 보고 있는 것으로 친다 */
const BOTTOM_SLACK_PX = 8;

/** 스크롤 상자가 맨 아래를 보고 있는가 — 맨 아래면 새 글줄을 따라 내려가고, 위로 올려 읽는 중이면 자리를 지킨다 */
export const isAtBottom = (el: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean =>
  el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK_PX;


const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function createMessage(id: number, text: string, opts: {
  tone?: MessageTone; channel?: MessageChannel; author?: string; now?: Date; from?: Msg['from'];
} = {}): Msg {
  const now = opts.now ?? new Date();
  return {
    id, ts: hhmm(now), text, at: now.getTime(),
    tone: opts.tone ?? 'info',
    channel: opts.channel ?? 'system',
    ...(opts.author ? { author: opts.author } : {}),
    ...(opts.from ? { from: opts.from } : {}),
  };
}

/** 두 기록을 만든 시각 순으로 합친다. 시각이 같으면 앞 기록이 먼저다 */
export function mergeMessages(a: readonly Msg[], b: readonly Msg[]): Msg[] {
  if (b.length === 0) return [...a];
  return [...a, ...b].sort((x, y) => x.at - y.at);
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
