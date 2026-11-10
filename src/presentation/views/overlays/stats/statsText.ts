import { fmtMult } from '../../../ui/format';
import type { SpotFit, StatsSpotRow } from '../../../../features/gameplay/model/stats';

// 스탯창 탭들이 함께 쓰는 표시 문구와 색: 해역 적합도 이름과 글자색, GOOD 영역 표기, 파워 충족 안내.

export const FIT_LABEL: Record<SpotFit, string> = { ok: '충족', power: '파워 부족', boat: '배 필요' };

/** 적합도 글자색: 충족은 하늘색, 파워 부족은 위험색, 배 필요는 보조색 */
export const FIT_TONE: Record<SpotFit, string> = { ok: 'text-accent', power: 'text-danger', boat: 'text-text-dim' };

export const goodText = (row: StatsSpotRow): string =>
  row.data.powerZones.yellow > 0 ? `${Math.round(row.data.powerZones.yellow)}%` : '요구 미달';

export const UNDERPOWERED_NOTE = '이 해역에서는 낚싯대 파워가 모자라요.\nGOOD 영역과 PERFECT 영역이 사라지고 희귀한 물고기가 덜 걸려요.\n입질도 늦어져요.\n집 작업대나 항구 공방에서 강화해 주세요.';
export const POWERED_NOTE = '낚싯대가 충분히 강해서 이 해역의 물고기를 낚기 쉬워요.';

type IdleMultiplier = StatsSpotRow['data']['idle'];

/** 방치 낚시 배수의 표시값 - 추첨이 실제로 곱하는 값이다 */
export const idleText = (idle: IdleMultiplier): string => fmtMult(idle.applied);

/** 방치 배수의 내역 목록 - 파워가 요구치와 같으면 null이다(내역이 없다) */
export function idleRows(row: StatsSpotRow): { label: string; value: string }[] | null {
  const { idle, currentPower, requirement } = row.data;
  if (currentPower === requirement) return null;
  return [
    { label: '요구 파워', value: fmtMult(idle.required) },
    ...(currentPower < requirement ? [{ label: '파워 부족', value: fmtMult(idle.penalty) }] : []),
    { label: '지금 파워', value: idleText(idle) },
  ];
}
