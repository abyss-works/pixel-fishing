import { useState } from 'react';

// 시스템 메시지 로그 — MMO 채팅창처럼 흘러가는 기록 (스테이지 좌하단 오버레이, v0.9 채팅 승격 자리)
export interface Msg { id: number; ts: string; text: string; tone: 'info' | 'gold' | 'warn' }

const LOG_KEEP = 30; // 보관 상한 (표시는 최근 8개)
let msgSeq = 0;

// 내용 휴리스틱으로 색조 분류 (보상=gold, 경고=warn) — 이모지 폐지(v0.4.2) 후 키워드만 본다
function mkMsg(text: string): Msg {
  const tone: Msg['tone'] = /부족하다|올바르지|없는 쿠폰|실패|거부|끊겨|않아요/.test(text) ? 'warn'
    : /PERFECT|획득|구매|벌었다|해금|열렸다|쿠폰 사용|달성/.test(text) ? 'gold'
    : 'info';
  const d = new Date();
  const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { id: msgSeq++, ts, text, tone };
}

export function useMessageLog(initial: string[]) {
  const [log, setLog] = useState<Msg[]>(() => initial.map(mkMsg));
  const setToast = (text: string) =>
    setLog(l => [...l.slice(-(LOG_KEEP - 1)), mkMsg(text)]);
  return { log, setToast };
}
