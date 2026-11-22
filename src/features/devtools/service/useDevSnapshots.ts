import { useState } from 'react';
import type { GameState } from '../../../game/rules/logic';
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

  const save = (state: GameState, label: string): DevSnapshotEntry => {
    const entry = buildSnapshotEntry(state, label, new Date().toISOString(), crypto.randomUUID());
    const next = addSnapshotEntry(snapshots, entry);
    setSnapshots(next);
    writeStorage(next);
    return entry;
  };

  const remove = (id: string) => {
    const next = removeSnapshotEntry(snapshots, id);
    setSnapshots(next);
    writeStorage(next);
  };

  return { snapshots, save, remove };
}
