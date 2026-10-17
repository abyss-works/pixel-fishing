import { useState } from 'react';
import { appendMessage, createMessage } from '../../ui/hud/messageFeed';
import type { Msg, MessageTone } from '../../ui/hud/messageFeed';

export type { Msg } from '../../ui/hud/messageFeed';

// 시스템 메시지 기록 — HUD 메시지 창의 상태. 형식·보관 상한은 메시지 피드 규칙을 따른다.
let msgSeq = 0;

export function useMessageLog(initial: string[]) {
  const [log, setLog] = useState<Msg[]>(() => initial.map(t => createMessage(msgSeq++, t)));
  const setToast = (text: string, tone?: MessageTone) =>
    setLog(l => appendMessage(l, createMessage(msgSeq++, text, { tone })));
  return { log, setToast };
}
