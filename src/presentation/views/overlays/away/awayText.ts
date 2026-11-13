import type { AwaySummary, AwayTip } from '../../../../game/rules/away';
import { boatNameOf } from '../../../../game/content/boats';
import { fmtGold, fmtMinutes, fmtNum } from '../../../ui/format';

// 방치 결과 보고의 표시 문구 — 알림 카드, 결과 창, 메시지 창 한 줄이 함께 쓴다.

const MINUTE = 60_000;

/** 걸린 시간 — "2시간 14분", 1분이 안 되면 "1분 미만" */
export const awayDuration = (ms: number): string => fmtMinutes(Math.floor(ms / MINUTE));

/** 메시지 창 한 줄 */
export function awayLineText(s: AwaySummary): string {
  const dex = s.newFish.length > 0 ? ` 새 도감 ${s.newFish.length}종.` : '';
  return `${awayDuration(s.awayMs)} 동안 ${fmtNum(s.catches)}마리를 잡았어요.${dex}`;
}

/** 가방이 차서 일어난 일의 서술 — 기운으로 바꾼 수와 놓아준 수가 있는 만큼만 잇는다 */
function bagOverflowOutcome(s: AwaySummary): string {
  const extracted = `${fmtNum(s.extracted.count)}마리를 생명의 기운으로`;
  const released = `${fmtNum(s.released.count)}마리를 놓아줬어요.`;
  if (s.extracted.count === 0) return released;
  return s.released.count === 0 ? `${extracted} 바꿨어요.` : `${extracted} 바꾸고 ${released}`;
}

/** 가방이 찼을 때의 한 줄. 차지 않았으면 null */
export function bagFullText(s: AwaySummary): string | null {
  if (s.bagFullAfterMs === null) return null;
  const outcome = bagOverflowOutcome(s);
  return s.bagFullAfterMs < MINUTE
    ? `가방이 이미 차 있어서 ${outcome}`
    : `${awayDuration(s.bagFullAfterMs)} 만에 가방이 차서 ${outcome}`;
}

/** 가방 타임라인 가운데 문구 */
export function bagTimelineText(s: AwaySummary): string {
  const full = s.bagFullAfterMs ?? 0;
  const head = full < MINUTE ? '떠날 때 이미 가득 참' : `${awayDuration(full)} 만에 가득 참`;
  const parts: string[] = [];
  if (s.extracted.count > 0) parts.push(`${fmtNum(s.extracted.count)}마리를 기운으로 바꿈`);
  if (s.released.count > 0 || parts.length === 0) {
    parts.push(`${fmtNum(s.released.count)}마리(${fmtGold(s.released.value)})를 놓아줌`);
  }
  return `${head}. 이후 ${awayDuration(s.awayMs - full)} 동안 ${parts.join(', ')}`;
}

/** "다음엔" 조언 한 줄 */
export function awayTipText(tip: AwayTip): string {
  if (tip.kind === 'sell') {
    const when = tip.fullAfterMs < MINUTE ? '떠날 때 가방이 이미 차 있었어요.' : `이번엔 ${awayDuration(tip.fullAfterMs)} 만에 가방이 찼어요.`;
    return `${when} 오래 비울 땐 먼저 팔고 가세요.`;
  }
  const eta = tip.etaMs === null ? '' : ` 지금 속도면 약 ${fmtMinutes(Math.max(1, Math.ceil(tip.etaMs / MINUTE)))}이에요.`;
  return `다음 배 ${boatNameOf(tip.boat)}까지 명성 ${fmtNum(tip.left)} 남았어요.${eta}`;
}

/** 기간 — "14:02 ~ 16:16". 날짜가 다르면 앞에 월/일을 붙인다 */
export function awayPeriodText(s: AwaySummary): string {
  const from = new Date(s.from), to = new Date(s.to);
  const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} `;
  const sameDay = from.toDateString() === to.toDateString();
  return `${sameDay ? '' : md(from)}${hm(from)} ~ ${sameDay ? '' : md(to)}${hm(to)}`;
}
