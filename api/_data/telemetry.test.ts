// 텔레메트리 저장 모듈 단위 테스트 — eventsBefore가 counted 열을 SELECT에 포함해 불리언으로 반환하는지 검증한다.
import { describe, expect, it, vi } from 'vitest';
import type { Executor } from '../_db/client.js';
import { eventsBefore } from './telemetry.js';

describe('eventsBefore', () => {
  it('SELECT 목록에 counted 열을 포함하고 반환 행의 counted 불리언을 보존한다', async () => {
    const sampleRows = [
      {
        id: 101,
        user_id: '00000000-0000-4000-8000-000000000001',
        type: 'sell',
        payload: { gold: 50 },
        created_at: '2026-10-01T00:00:00.000Z',
        counted: true,
      },
      {
        id: 102,
        user_id: '00000000-0000-4000-8000-000000000002',
        type: 'boot',
        payload: {},
        created_at: '2026-10-01T00:01:00.000Z',
        counted: false,
      },
    ];
    let capturedSql = '';
    const db = {
      execute: vi.fn(async (query: unknown) => {
        capturedSql = JSON.stringify(query);
        return { rows: [{ page: sampleRows }] };
      }),
    } as unknown as Executor;

    const rows = await eventsBefore(db, '2026-10-07T00:00:00.000Z', 100, 5000);

    expect(capturedSql).toContain('select id, user_id, type, payload, created_at, counted from public.events');
    expect(rows).toEqual(sampleRows);
    expect(typeof rows[0].counted).toBe('boolean');
    expect(rows[0].counted).toBe(true);
    expect(rows[1].counted).toBe(false);
  });
});
