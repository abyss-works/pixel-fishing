import { useEffect, useReducer, useRef } from 'react';
import { loadMessageFold, saveMessageFold } from '../../../platform/api/messageFold';
import { foldInitial, isFolded, messageFoldReducer, parseSeaFolded, scanPosts, serializeSeaFolded } from '../model/messageFold';
import type { FilterChannel, MessageFilter } from '../model/messageFilter';

/**
 * 메시지 창 접기 상태. 거점이면 접힘으로 시작하고, 바다에서 쓰는 상태는 이 기기에 남아 다음 접속에도 이어진다.
 * log는 새 글 판정에 쓴다. 접힌 동안 켜 둔 채널에 새 글이 오면 unread가 켜진다.
 */
export function useMessageFold(inBase: boolean, log: readonly { at: number; channel: FilterChannel }[], filter: MessageFilter) {
  const [state, dispatch] = useReducer(messageFoldReducer, undefined, () =>
    foldInitial(inBase ? 'base' : 'sea', parseSeaFolded(loadMessageFold())));

  useEffect(() => { dispatch({ type: 'enter', place: inBase ? 'base' : 'sea' }); }, [inBase]);
  useEffect(() => { saveMessageFold(serializeSeaFolded(state.sea)); }, [state.sea]);

  // 접속 전의 기록은 새 글이 아니므로 기준 시각은 처음 그린 때다
  const since = useRef(Date.now());
  useEffect(() => {
    const scan = scanPosts(log, filter, since.current);
    since.current = scan.since;
    if (scan.fresh) dispatch({ type: 'post' });
  }, [log, filter]);

  return {
    folded: isFolded(state),
    unread: state.unread,
    toggle: () => dispatch({ type: 'toggle' }),
    setTyping: (on: boolean) => dispatch({ type: 'typing', on }),
  };
}
