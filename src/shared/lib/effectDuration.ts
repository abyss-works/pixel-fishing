/** 슬롯 지속·남은 시간 표기 — 1분 이상은 분까지만, 1분 미만은 초만 표시한다. 초 아래와 0 이하는 버린다. */
export function fmtEffectDuration(min: number): string {
  const totalSec = Math.max(0, Math.floor(min * 60));
  if (totalSec < 60) return `${totalSec}초`;
  const totalMin = Math.floor(totalSec / 60);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}
