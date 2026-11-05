import { useState } from 'react';
import { loadMessageFilter, saveMessageFilter } from '../../../platform/api/messageFilter';
import { parseMessageFilter, toggleChannel } from '../model/messageFilter';
import type { FilterChannel, MessageFilter } from '../model/messageFilter';

/** 메시지 창의 채널 표시 — 고른 값은 이 기기에 남아 다음 접속에도 이어진다 */
export function useMessageFilter(): { filter: MessageFilter; toggle: (channel: FilterChannel) => void } {
  const [filter, setFilter] = useState(() => parseMessageFilter(loadMessageFilter()));
  const toggle = (channel: FilterChannel) => {
    const next = toggleChannel(filter, channel);
    if (next === filter) return;
    setFilter(next);
    saveMessageFilter(next);
  };
  return { filter, toggle };
}
