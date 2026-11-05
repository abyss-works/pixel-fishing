// 자리 비움 — 창이 숨겨지거나 포커스를 잃은 순간을 떠남, 보이는 상태로 포커스가 돌아온 순간을 복귀로 본다.
// 떠난 시각은 저장소에 남겨 새로고침·탭 폐기 뒤에도 쓴다. 결과 요약은 서버 읽기 함수(GET /api/away-report)가 준다.
// 클라우드 미설정(로컬 dev·테스트)이면 행동 기록이 없어 null이다. 그 밖의 실패는 던진다.
import { AppError } from '../../core/errors';
import { isCloud } from './auth';
import type { AwaySummary } from '../../game/rules/away';

export const AWAY_LEFT_KEY = 'pf-away-left';

export async function readAwayReport(awayMs: number): Promise<AwaySummary | null> {
  if (!isCloud) return null;
  const res = await fetch(`/api/away-report?awayMs=${Math.floor(awayMs)}`);
  if (!res.ok) throw new AppError('network', 'away report read failed', { status: res.status });
  return await res.json() as AwaySummary;
}

// 저장소가 막힌 환경에서는 이번 세션의 메모리 값만 쓴다
let memory: number | null = null;
function readLeft(): number | null {
  try {
    const v = Number(localStorage.getItem(AWAY_LEFT_KEY));
    return v > 0 ? v : null;
  } catch {
    return memory;
  }
}
function writeLeft(at: number | null): void {
  memory = at;
  try {
    if (at === null) localStorage.removeItem(AWAY_LEFT_KEY);
    else localStorage.setItem(AWAY_LEFT_KEY, String(at));
  } catch { /* 메모리 값만 남는다 */ }
}

/** 떠남·복귀를 지켜보다가 돌아오면 비운 시간(ms)을 알린다. 같은 부재는 한 번만 알린다. 반환값은 지켜보기를 멈춘다 */
export function watchAway(onReturn: (awayMs: number) => void): () => void {
  const check = () => {
    if (document.hidden || !document.hasFocus()) {
      // 먼저 떠난 시각을 지킨다 — 포커스를 잃은 뒤 탭이 숨겨져도 부재의 시작은 처음 신호다
      if (readLeft() === null) writeLeft(Date.now());
      return;
    }
    const left = readLeft();
    if (left === null) return;
    writeLeft(null);
    onReturn(Math.max(0, Date.now() - left));
  };
  check();
  window.addEventListener('blur', check);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  return () => {
    window.removeEventListener('blur', check);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', check);
  };
}
