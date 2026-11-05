// 메시지 창 채널 표시 저장 — 기기별 표시 설정(localStorage). 진행이 아니라 보는 방식이라
// 세이브·서버 권위 대상이 아니다. 저장값 해석은 기능 계층이 한다.

export const MESSAGE_FILTER_KEY = 'pf-message-filter';

export function loadMessageFilter(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(MESSAGE_FILTER_KEY) : null;
  } catch {
    return null; // 저장소 접근이 막힌 환경
  }
}

export function saveMessageFilter(value: string): void {
  try { localStorage.setItem(MESSAGE_FILTER_KEY, value); } catch { /* 저장 실패 — 이번 세션에만 적용 */ }
}
