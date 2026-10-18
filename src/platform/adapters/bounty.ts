// 바운티 헌팅 읽기 — 수배판 표시용 스냅샷 (RLS 본인 읽기).
// 표시용 조회라 게임 액션 경로를 타지 않는다.
// supabase 미설정(로컬 dev·테스트)이면 null — 패널이 오프라인 안내를 띄운다.
// 그 밖의 실패는 null로 숨기지 않고 던진다. null은 "오프라인"이라는 뜻이라, 실패를 null로 바꾸면
// 조회가 다시 시도하지 않고 화면이 수주 정보를 잃은 채 머문다.
import { AppError } from '../../core/errors';
import { supabase } from './auth';
import { clearsOf, splitQuestRows } from '../../game/rules/bountyRows.js';
import { gameDayOf, gameDayStartISO } from '../../game/rules/time.js';
import type { BountySnapshot } from '../api/types';

/** KST 달력 날짜 — 서버의 todayKST와 같은 날짜. 의뢰와 무관한 하루 단위(계정 안내)에 쓴다 */
export const kstDay = (): string =>
  new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** 게임 날짜(KST 04:00 경계) — 서버가 일일 의뢰를 정하고 의뢰를 만료시키는 날짜와 같다 */
export const gameDay = (): string => gameDayOf(new Date().toISOString());

export async function readBounty(): Promise<BountySnapshot | null> {
  if (!supabase) return null;
  // 세션부터 확정한다 — 저장된 토큰의 갱신을 여기서 한 번 끝내고 세 조회가 같은 토큰을 쓴다.
  // 세션이 아직 없으면(부트스트랩의 익명 로그인 전) 익명 권한의 빈 결과를 진실로 삼지 않는다.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new AppError('unauthorized', 'bounty read before session');
  const dayStart = gameDayStartISO(new Date().toISOString());
  const [clr, prog, tick] = await Promise.all([
    supabase.from('bounty_clears').select('kind, cleared_at').gte('cleared_at', dayStart),
    supabase.from('bounty_progress').select('quest_id, progress, started_at'),
    supabase.from('bounty_tickets').select('quest_id, issued_at'),
  ]);
  const failed = [clr, prog, tick].find(r => r.error);
  if (failed?.error) throw new AppError('network', 'bounty read failed', { message: failed.error.message });
  // 서버가 주입 진실을 만드는 것과 같은 함수로 거른다 — 날이 바뀌며 만료된 의뢰는 진행도·도전권과 함께 없는 것이다
  const { live } = splitQuestRows(
    ((prog.data ?? []) as { quest_id: string; progress: number; started_at: string }[])
      .map(p => ({ questId: p.quest_id, progress: Number(p.progress), startedAt: p.started_at })),
    dayStart,
  );
  const liveIds = new Set(live.map(row => row.questId));
  return {
    clearsToday: clearsOf(
      ((clr.data ?? []) as { kind: string; cleared_at: string }[]).map(c => ({ kind: c.kind, clearedAt: c.cleared_at })),
      dayStart,
    ),
    progress: live.map(row => ({ questId: row.questId, progress: row.progress })),
    tickets: ((tick.data ?? []) as { quest_id: string; issued_at: string }[])
      .filter(t => liveIds.has(t.quest_id))
      .map(t => ({ questId: t.quest_id, issuedAt: t.issued_at })),
  };
}
