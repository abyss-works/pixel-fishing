import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  MAX_TOAST_DESKTOP,
  createMirrorHistory,
  decideToastMirror,
  enqueueToast,
  logToneOf,
  recordMirrorEmission,
  registerNoticeSink,
  toastToneFromLogTone,
} from '../../../features/display/model/toastPolicy';
import type {
  MirrorEnv,
  NoticeTip,
  PlannedToast,
  QueuedToast,
  SystemNoticeInput,
} from '../../../features/display/model/toastPolicy';
import { getToastEnabled } from '../../../features/display/service/toastEnabled';
import type { FloatingToastItem } from '../../ui/FloatingToastLayer';
import { appendMessage, createMessage } from '../../ui/hud/messageFeed';
import type { MessageTone, Msg, Notify } from '../../ui/hud/messageFeed';
import { hasOpenWindows } from '../../ui/openWindows';

export type { Msg } from '../../ui/hud/messageFeed';
export type { FloatingToastItem } from '../../ui/FloatingToastLayer';

export interface MirrorContextPatch {
  folded?: boolean;
  blocked?: boolean;
  loading?: boolean;
  awayCardVisible?: boolean;
}

interface BatchEntry {
  toast: PlannedToast;
  signature: string;
  cooldownKey?: string;
  count: number;
  timer: ReturnType<typeof setTimeout>;
}

// 시스템 메시지 기록 — HUD 메시지 창의 상태. 모든 시스템 이벤트는 예외 없이 먼저 메시지 기록에 남고,
// 토스트 정책이 선별한 고신호 이벤트만 +α 플로팅 토스트로 동시 미러링한다.
let msgSeq = 0;

function batchSummaryText(batchKey: string, firstText: string, count: number): string {
  if (count <= 1) return firstText;
  if (batchKey === 'achievement.unlockable') return `업적 보상 ${count}개 도착!`;
  if (batchKey === 'achievement.claimed') return `${count}개 업적 보상 수령!`;
  return firstText;
}

export function useMessageLog(initial: string[]) {
  const [log, setLog] = useState<Msg[]>(() => initial.map(t => createMessage(msgSeq++, t)));
  const [toasts, setToasts] = useState<QueuedToast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const batchesRef = useRef<Map<string, BatchEntry>>(new Map());
  const historyRef = useRef(createMirrorHistory());
  const heldLoadingRef = useRef<SystemNoticeInput[]>([]);
  const envRef = useRef<Omit<MirrorEnv, 'toastEnabled' | 'hasOpenWindows'>>({
    folded: false,
    blocked: false,
    loading: false,
    awayCardVisible: false,
  });

  const clearToastTimers = useCallback(() => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  const clearBatches = useCallback(() => {
    for (const entry of batchesRef.current.values()) clearTimeout(entry.timer);
    batchesRef.current.clear();
  }, []);

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => () => {
    clearToastTimers();
    clearBatches();
  }, [clearToastTimers, clearBatches]);

  const pushQueuedToast = useCallback((id: number, planned: PlannedToast) => {
    const incoming: QueuedToast = {
      id,
      text: planned.text,
      tone: planned.tone,
      priority: planned.priority,
      ttlMs: planned.ttlMs,
      replaceKey: planned.replaceKey,
    };
    setToasts(prev => {
      const { next, droppedIds } = enqueueToast(prev, incoming, MAX_TOAST_DESKTOP);
      for (const droppedId of droppedIds) {
        const timer = timersRef.current.get(droppedId);
        if (timer !== undefined) {
          clearTimeout(timer);
          timersRef.current.delete(droppedId);
        }
      }
      if (!next.some(item => item.id === id)) return prev;
      return next;
    });
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts(prev => prev.filter(t => t.id !== id));
    }, planned.ttlMs);
    timersRef.current.set(id, timer);
  }, []);

  const tryMirror = useCallback((id: number, input: SystemNoticeInput) => {
    const nowMs = Date.now();
    const env: MirrorEnv = {
      ...envRef.current,
      toastEnabled: getToastEnabled(),
      hasOpenWindows: hasOpenWindows(),
    };
    const decision = decideToastMirror(input, env, nowMs, historyRef.current);
    if (decision.action === 'skip') return;
    if (decision.action === 'hold') {
      heldLoadingRef.current.push(input);
      return;
    }

    const { toast, signature, cooldownKey } = decision;
    if (toast.batchKey && toast.batchWindowMs) {
      const batchKey = toast.batchKey;
      const existing = batchesRef.current.get(batchKey);
      if (existing) {
        existing.count += 1;
        recordMirrorEmission(historyRef.current, signature, cooldownKey, nowMs);
        return;
      }
      recordMirrorEmission(historyRef.current, signature, cooldownKey, nowMs);
      const timer = setTimeout(() => {
        const entry = batchesRef.current.get(batchKey);
        batchesRef.current.delete(batchKey);
        if (!entry) return;
        const summary = batchSummaryText(batchKey, entry.toast.text, entry.count);
        pushQueuedToast(msgSeq++, { ...entry.toast, text: summary });
      }, toast.batchWindowMs);
      batchesRef.current.set(batchKey, { toast, signature, cooldownKey, count: 1, timer });
      return;
    }

    recordMirrorEmission(historyRef.current, signature, cooldownKey, nowMs);
    pushQueuedToast(id, toast);
  }, [pushQueuedToast]);

  const setMirrorEnv = useCallback((patch: MirrorContextPatch) => {
    const wasLoading = envRef.current.loading;
    envRef.current = { ...envRef.current, ...patch };
    if (patch.blocked) {
      heldLoadingRef.current = [];
      clearBatches();
      clearToastTimers();
      setToasts([]);
      return;
    }
    if (wasLoading && patch.loading === false && heldLoadingRef.current.length > 0) {
      const pending = heldLoadingRef.current;
      heldLoadingRef.current = [];
      for (const item of pending) {
        tryMirror(msgSeq++, item);
      }
    }
  }, [clearBatches, clearToastTimers, tryMirror]);

  const setToast: Notify = useCallback((text: string, tone?: MessageTone, tip?: NoticeTip) => {
    const id = msgSeq++;
    const resolvedLogTone = tone ?? 'info';
    setLog(l => appendMessage(l, createMessage(id, text, { tone: resolvedLogTone, tip })));
    const input: SystemNoticeInput = {
      kind: resolvedLogTone === 'warn' ? 'system.modalRejected' : 'legacy.untyped',
      text,
      tone: toastToneFromLogTone(resolvedLogTone),
      logTone: resolvedLogTone,
      tip,
    };
    tryMirror(id, input);
  }, [tryMirror]);

  const sendStructured = useCallback((input: SystemNoticeInput) => {
    const id = msgSeq++;
    const resolvedLogTone = logToneOf(input);
    setLog(l => appendMessage(l, createMessage(id, input.text, { tone: resolvedLogTone, tip: input.tip })));
    tryMirror(id, input);
  }, [tryMirror]);

  useLayoutEffect(() => {
    registerNoticeSink(setToast, sendStructured);
  }, [setToast, sendStructured]);

  const floatingToasts: readonly FloatingToastItem[] = toasts;
  return { log, setToast, toasts: floatingToasts, dismissToast, setMirrorEnv };
}
