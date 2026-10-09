// 현상금 읽기 — 수배판 표시용 스냅샷 (RLS 본인 읽기).
// backend/http.ts의 getNickname과 같은 위치다: 표시용 조회라 액션 경로를 타지 않는다.
// supabase 미설정(로컬 dev·테스트)이면 null — 패널이 오프라인 안내를 띄운다.
import { supabase } from '../backend/auth';

export interface BountyProgressRow { questId: string; progress: number }

export interface BountySnapshot {
  licensed: { zone: string; tier: string }[];
  acceptsToday: number;
  acceptsByPort: Record<string, number>;
  progress: BountyProgressRow[];
}

/** KST 날짜 — api/action.ts todayKST와 같은 시계 (일일 의뢰 해시용) */
export const kstDay = (): string =>
  new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** KST 자정(UTC ISO) — api/action.ts kstDayStartISO와 같은 시계 */
const kstDayStartISO = (): string => {
  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+09:00`).toISOString();
};

export async function readBounty(): Promise<BountySnapshot | null> {
  if (!supabase) return null;
  const dayStart = kstDayStartISO();
  const [lic, acc, prog] = await Promise.all([
    supabase.from('bounty_licenses').select('zone'),
    supabase.from('bounty_accepts').select('port, accepted_at').gte('accepted_at', dayStart),
    supabase.from('bounty_progress').select('quest_id, progress'),
  ]);
  if (lic.error || acc.error || prog.error) return null;
  const byPort: Record<string, number> = {};
  for (const a of (acc.data ?? []) as { port: string }[]) {
    byPort[a.port] = (byPort[a.port] ?? 0) + 1;
  }
  return {
    licensed: ((lic.data ?? []) as { zone: string; tier: string }[]).map(l => ({ zone: l.zone, tier: l.tier })),
    acceptsToday: ((acc.data ?? []) as unknown[]).length,
    acceptsByPort: byPort,
    progress: ((prog.data ?? []) as { quest_id: string; progress: number }[])
      .map(p => ({ questId: p.quest_id, progress: Number(p.progress) })),
  };
}
