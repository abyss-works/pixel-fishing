import { useState } from 'react';

// 시스템 메시지 로그 — MMO 채팅창처럼 흘러가는 기록 (스테이지 좌하단 오버레이, v0.9 채팅 승격 자리)
export interface Msg { id: number; ts: string; text: string; tone: 'info' | 'gold' | 'warn' }

const LOG_KEEP = 30; // 보관 상한 (표시는 최근 8개)
let msgSeq = 0;

// 톤 분류 — 명시 tone 파라미터가 정도(正道), 없으면 키워드 휴리스틱 폴백.
// (휴리스틱은 문구가 바뀌면 조용히 어긋난다 — 새 토스트는 tone을 명시할 것)
function mkMsg(text: string, tone?: Msg['tone']): Msg {
  const resolved: Msg['tone'] = tone
    ?? (/부족하다|올바르지|없는 쿠폰|실패|거부|끊겨|않아요/.test(text) ? 'warn'
      : /PERFECT|획득|구매|벌었다|해금|열렸다|쿠폰 사용|달성/.test(text) ? 'gold'
      : 'info');
  const d = new Date();
  const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { id: msgSeq++, ts, text, tone: resolved };
}

export function useMessageLog(initial: string[]) {
  const [log, setLog] = useState<Msg[]>(() => initial.map(t => mkMsg(t)));
  const setToast = (text: string, tone?: Msg['tone']) =>
    setLog(l => [...l.slice(-(LOG_KEEP - 1)), mkMsg(text, tone)]);
  return { log, setToast };
}
