import { describe, expect, it } from 'vitest';
import { FAME_GATE_QUERY, LIVE_QUERIES, SKIPPED } from './live';

describe('라이브 지표 조회', () => {
  it('모든 조회가 관리자 대시보드와 같은 제외 계정(제재·빈 익명)을 뺀다', () => {
    for (const [title, q] of [...Object.entries(LIVE_QUERIES), ['명성 게이트', FAME_GATE_QUERY] as const]) {
      expect(q, title).toContain(SKIPPED);
    }
  });
});
