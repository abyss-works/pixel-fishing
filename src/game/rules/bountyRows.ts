// 수배 표 행의 오늘 기준 판정 — 의뢰 만료와 하루 클리어 횟수.
// 서버(리듀서에 주입하는 진실)와 클라이언트(수배판 스냅샷)가 같은 함수를 써서 표시와 판정이 갈라지지 않는다.
// 시각은 문자열 비교가 아니라 순간으로 비교한다 — DB 직렬화(+00:00)와 경계(Z)의 표기가 다르다.
//
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.
import { bountyById, isBountyKind } from '../content/bounties.js';
import type { BountyKind } from '../content/bounties.js';

/** 수주 중 의뢰의 진행 행 — 수주하면 생기고 보상을 받으면 지워진다 */
export interface QuestRow { questId: string; progress: number; startedAt: string }
/** 클리어(보상 수령) 기록 행 */
export interface ClearRow { kind: string; clearedAt: string }

/** 수주 의뢰를 오늘(하루의 시작 순간 이후) 기준으로 가른다.
 *  유효 = 오늘 수주했거나, 수량을 채워 보상을 받을 수 있는 의뢰(날이 바뀌어도 받을 수 있다).
 *  만료 = 경계 이전에 수주하고 수량을 채우지 못한 의뢰 — 진행도와 도전권을 세지 않는다.
 *  등록되지 않은 의뢰의 행은 어느 쪽에도 넣지 않는다. */
export function splitQuestRows<T extends QuestRow>(rows: readonly T[], dayStartISO: string): { live: T[]; expired: T[] } {
  const dayStart = Date.parse(dayStartISO);
  const live: T[] = [];
  const expired: T[] = [];
  for (const row of rows) {
    const quest = bountyById(row.questId);
    if (!quest) continue;
    const kept = row.progress >= quest.count || Date.parse(row.startedAt) >= dayStart;
    (kept ? live : expired).push(row);
  }
  return { live, expired };
}

/** 오늘 클리어한 횟수 — 갈래별. 경계 이전 기록과 모르는 갈래는 세지 않는다 */
export function clearsOf(rows: readonly ClearRow[], dayStartISO: string): Record<BountyKind, number> {
  const dayStart = Date.parse(dayStartISO);
  const out: Record<BountyKind, number> = { general: 0, named: 0 };
  for (const row of rows) {
    if (isBountyKind(row.kind) && Date.parse(row.clearedAt) >= dayStart) out[row.kind]++;
  }
  return out;
}
