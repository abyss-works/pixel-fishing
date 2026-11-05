// 메시지 창 채널 표시 — 채팅·시스템 두 토글. 둘 다 켜면 전체다. 마지막으로 켜져 있는 하나는 끌 수 없다.
export type FilterChannel = 'chat' | 'system';
export type MessageFilter = 'all' | FilterChannel;

const OTHER: Record<FilterChannel, FilterChannel> = { chat: 'system', system: 'chat' };

export const isChannelShown = (filter: MessageFilter, channel: FilterChannel): boolean =>
  filter === 'all' || filter === channel;

/** 토글 하나를 누른 뒤의 표시 상태 */
export function toggleChannel(filter: MessageFilter, channel: FilterChannel): MessageFilter {
  if (filter === 'all') return OTHER[channel];
  if (filter === channel) return filter; // 마지막 하나는 끌 수 없다
  return 'all';
}

/** 저장값 해석 — 없거나 알 수 없으면 전체다 */
export const parseMessageFilter = (raw: string | null): MessageFilter =>
  raw === 'chat' || raw === 'system' ? raw : 'all';
