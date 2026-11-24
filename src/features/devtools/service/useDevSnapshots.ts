import { useState } from 'react';
import type { GameState } from '../../../game/rules/logic';
import type { DevBountySnapshot } from '../../../game/rules/debug';
import {
  DEV_SNAPSHOTS_KEY,
  addSnapshotEntry,
  buildSnapshotEntry,
  parseSnapshotsJson,
  removeSnapshotEntry,
} from '../model/snapshots';
import type { DevSnapshotEntry } from '../model/snapshots';

function readStorage(): DevSnapshotEntry[] {
  try {
    return typeof localStorage !== 'undefined' ? parseSnapshotsJson(localStorage.getItem(DEV_SNAPSHOTS_KEY)) : [];
  } catch {
    return [];
  }
}

function writeStorage(list: DevSnapshotEntry[]): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DEV_SNAPSHOTS_KEY, JSON.stringify(list));
  } catch { /* 용량 부족 등 저장 실패 무시 */ }
}

/** 개발 도구 스냅샷 저장/목록/삭제 훅 */
export function useDevSnapshots() {
  const [snapshots, setSnapshots] = useState<DevSnapshotEntry[]>(readStorage);

  const save = (state: GameState, label: string, bounty?: DevBountySnapshot): DevSnapshotEntry => {
    const entry = buildSnapshotEntry(state, label, new Date().toISOString(), crypto.randomUUID(), bounty);
    setSnapshots(prev => {
      const next = addSnapshotEntry(prev, entry);
      writeStorage(next);
      return next;
    });
    return entry;
  };

  const attachBounty = (id: string, bounty: DevBountySnapshot): void => {
    setSnapshots(prev => {
      const next = prev.map(e => (e.id === id ? { ...e, bounty } : e));
      writeStorage(next);
      return next;
    });
  };

  const remove = (id: string) => {
    setSnapshots(prev => {
      const next = removeSnapshotEntry(prev, id);
      writeStorage(next);
      return next;
    });
  };

  return { snapshots, save, attachBounty, remove };
}
