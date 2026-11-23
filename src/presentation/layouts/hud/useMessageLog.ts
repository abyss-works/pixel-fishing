import { useCallback, useEffect, useRef, useState } from 'react';
import type { FloatingToastItem } from '../../ui/FloatingToastLayer';
import { appendMessage, createMessage } from '../../ui/hud/messageFeed';
import type { Msg, Notify } from '../../ui/hud/messageFeed';
import { hasOpenWindows } from '../../ui/openWindows';

export type { Msg } from '../../ui/hud/messageFeed';
export type { FloatingToastItem } from '../../ui/FloatingToastLayer';

// 시스템 메시지 기록 — HUD 메시지 창의 상태. 형식·보관 상한은 메시지 피드 규칙을 따른다.
// 모달이 열린 동안 발생한 알림은 모달 위 플로팅 1줄 알림으로도 띄운다.
let msgSeq = 0;
const TOAST_TTL_MS = 4500;
const MAX_FLOATING_TOASTS = 2;

export function useMessageLog(initial: string[]) {
  const [log, setLog] = useState<Msg[]>(() => initial.map(t => createMessage(msgSeq++, t)));
  const [toasts, setToasts] = useState<FloatingToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  const setToast: Notify = useCallback((text, tone, tip) => {
    const id = msgSeq++;
    const resolvedTone = tone ?? 'info';
    setLog(l => appendMessage(l, createMessage(id, text, { tone: resolvedTone, tip })));
    if (hasOpenWindows()) {
      setToasts(prev => {
        const next = [{ id, text, tone: resolvedTone }, ...prev];
        for (const dropped of next.slice(MAX_FLOATING_TOASTS)) {
          const timer = timersRef.current.get(dropped.id);
          if (timer !== undefined) {
            clearTimeout(timer);
            timersRef.current.delete(dropped.id);
          }
        }
        return next.slice(0, MAX_FLOATING_TOASTS);
      });
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts(prev => prev.filter(t => t.id !== id));
      }, TOAST_TTL_MS);
      timersRef.current.set(id, timer);
    }
  }, []);

  return { log, setToast, toasts, dismissToast };
}
