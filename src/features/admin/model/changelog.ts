import type { AdminChangelogRow } from './types';

export interface ChangelogGroup {
  version: string;
  date: string;
  entries: AdminChangelogRow[];
}

/**
 * 서버가 준 순서(최신 버전부터, 버전 안에서는 순번 순서)를 지키며 버전별로 묶는다.
 * 철회된 항목은 showWithdrawn이 아니면 빼고, 보일 항목이 없는 버전은 목록에서도 뺀다.
 */
export function groupChangelog(rows: readonly AdminChangelogRow[], showWithdrawn: boolean): ChangelogGroup[] {
  const groups: ChangelogGroup[] = [];
  for (const row of rows) {
    if (!showWithdrawn && row.withdrawnAt !== null) continue;
    const last = groups[groups.length - 1];
    if (last?.version === row.version) last.entries.push(row);
    else groups.push({ version: row.version, date: row.date, entries: [row] });
  }
  return groups;
}
