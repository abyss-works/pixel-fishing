// 메시지 창 채널 표시 — 채팅·길드·시스템 토글. 켜진 채널의 목록이다.
// 기록에 나온 채널 가운데 마지막으로 켜져 있는 하나는 끌 수 없다(창이 비지 않게).
export type FilterChannel = 'chat' | 'guild' | 'system';
export type MessageFilter = readonly FilterChannel[];

/** 토글 순서이자 모두 켠 상태 */
export const FILTER_CHANNELS: MessageFilter = ['chat', 'guild', 'system'];

export const isChannelShown = (filter: MessageFilter, channel: FilterChannel): boolean => filter.includes(channel);

/**
 * 토글 하나를 누른 뒤의 표시 상태.
 * @param present 기록에 나온 채널(토글이 보이는 채널). 이 가운데 켜진 마지막 하나는 끌 수 없다
 */
export function toggleChannel(filter: MessageFilter, channel: FilterChannel, present: readonly FilterChannel[] = FILTER_CHANNELS): MessageFilter {
  if (!filter.includes(channel)) return FILTER_CHANNELS.filter(c => c === channel || filter.includes(c));
  if (!filter.some(c => c !== channel && present.includes(c))) return filter;
  return filter.filter(c => c !== channel);
}

/** 저장값 — 켜진 채널을 쉼표로 잇는다 */
export const serializeMessageFilter = (filter: MessageFilter): string => filter.join(',');

/** 저장값 해석 — 없거나 알 수 없으면 전체다. 이전 형식(all, chat, system)도 읽는다 */
export function parseMessageFilter(raw: string | null): MessageFilter {
  const parts = (raw ?? '').split(',');
  const filter = FILTER_CHANNELS.filter(c => parts.includes(c));
  return filter.length > 0 ? filter : FILTER_CHANNELS;
}
