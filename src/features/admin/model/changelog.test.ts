import { describe, expect, it } from 'vitest';
import type { AdminChangelogRow } from './types';
import { groupChangelog } from './changelog';

const row = (id: string, over: Partial<AdminChangelogRow> = {}): AdminChangelogRow => ({
  id, version: id.split('-')[0], date: '2026-11-11', seq: Number(id.split('-')[1]), tier: 'public', tag: 'UI', text: id,
  withdrawnAt: null, ...over,
});

describe('변경 기록 묶기', () => {
  it('서버가 준 순서를 지키며 버전별로 묶는다', () => {
    const groups = groupChangelog([row('0.2.0-01'), row('0.2.0-02', { tier: 'admin' }), row('0.1.0-01', { date: '2026-11-10' })], false);
    expect(groups.map(g => [g.version, g.date, g.entries.map(e => e.id)])).toEqual([
      ['0.2.0', '2026-11-11', ['0.2.0-01', '0.2.0-02']],
      ['0.1.0', '2026-11-10', ['0.1.0-01']],
    ]);
  });

  it('철회된 항목은 기본으로 빼고, 모두 철회된 버전은 목록에서 빠진다', () => {
    const rows = [row('0.2.0-01', { withdrawnAt: '2026-11-12T00:00:00+00:00' }), row('0.1.0-01'), row('0.1.0-02', { withdrawnAt: '2026-11-12T00:00:00+00:00' })];
    expect(groupChangelog(rows, false).map(g => [g.version, g.entries.map(e => e.id)])).toEqual([['0.1.0', ['0.1.0-01']]]);
  });

  it('철회 항목을 함께 보이면 모두 남는다', () => {
    const rows = [row('0.2.0-01', { withdrawnAt: '2026-11-12T00:00:00+00:00' }), row('0.1.0-01')];
    expect(groupChangelog(rows, true).map(g => g.entries.map(e => e.id))).toEqual([['0.2.0-01'], ['0.1.0-01']]);
  });

  it('행이 없으면 빈 목록이다', () => {
    expect(groupChangelog([], false)).toEqual([]);
    expect(groupChangelog([], true)).toEqual([]);
  });
});
