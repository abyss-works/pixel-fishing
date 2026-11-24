// 개발 도구 원클릭 스냅샷 모델 — 순수 TypeScript (브라우저 저장소 직접 접근 없음).
import type { GameState } from '../../../game/rules/logic';
import { dexSpeciesCount } from '../../../game/rules/logic';
import { parseSnapshotBounty } from '../../../game/rules/debug';
import type { DevBountySnapshot } from '../../../game/rules/debug';

export const DEV_SNAPSHOTS_KEY = 'pf-devtools-snapshots';
export const MAX_DEV_SNAPSHOTS = 5;

export interface DevSnapshotEntry {
  id: string;
  label: string;
  savedAt: string;
  summary: string;
  state: GameState;
  bounty?: DevBountySnapshot;
}

export function formatSnapshotSummary(state: GameState): string {
  const dex = dexSpeciesCount(state);
  return `배 ${state.boat} · Lv.${state.rod} · ${state.gold.toLocaleString('ko-KR')}G · 도감 ${dex}종 · 가방 ${state.bag.length}`;
}

export function buildSnapshotEntry(
  state: GameState,
  label: string,
  nowISO: string,
  id: string,
  bounty?: DevBountySnapshot,
): DevSnapshotEntry {
  const trimmed = label.trim();
  const hhmm = nowISO.slice(11, 16);
  return {
    id,
    label: trimmed || `스냅샷 ${hhmm}`,
    savedAt: nowISO,
    summary: formatSnapshotSummary(state),
    state,
    ...(bounty ? { bounty } : {}),
  };
}

export function addSnapshotEntry(
  list: readonly DevSnapshotEntry[],
  entry: DevSnapshotEntry,
): DevSnapshotEntry[] {
  return [entry, ...list].slice(0, MAX_DEV_SNAPSHOTS);
}

export function removeSnapshotEntry(
  list: readonly DevSnapshotEntry[],
  id: string,
): DevSnapshotEntry[] {
  return list.filter(e => e.id !== id);
}

export function parseSnapshotsJson(raw: string | null): DevSnapshotEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is DevSnapshotEntry =>
        typeof x === 'object' && x !== null
        && typeof (x as DevSnapshotEntry).id === 'string'
        && typeof (x as DevSnapshotEntry).label === 'string'
        && typeof (x as DevSnapshotEntry).savedAt === 'string'
        && typeof (x as DevSnapshotEntry).summary === 'string'
        && typeof (x as DevSnapshotEntry).state === 'object'
        && (x as DevSnapshotEntry).state !== null)
      .slice(0, MAX_DEV_SNAPSHOTS)
      .map(entry => {
        const bounty = entry.bounty !== undefined ? parseSnapshotBounty(entry.bounty) : null;
        return bounty ? { ...entry, bounty } : { id: entry.id, label: entry.label, savedAt: entry.savedAt, summary: entry.summary, state: entry.state };
      });
  } catch {
    return [];
  }
}
