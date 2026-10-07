// 편지 이중 기록 — letter 이벤트만 letters에 insert하고(created_at 명시), 실패는 500으로 끊는다.
import { describe, it, expect } from 'vitest';
import { writeLetters } from './action.js';

const TS = '2026-10-07T00:00:00.000Z';

const fakeAdmin = (inserted: unknown[], error?: unknown) => ({
  from: (_table: string) => ({
    insert: (rows: unknown[]) => { if (!error) inserted.push(...rows); return Promise.resolve({ error }); },
  }),
});

describe('writeLetters', () => {
  it('letter 이벤트만 letters 행으로 insert한다 (created_at 명시)', async () => {
    const inserted: unknown[] = [];
    await writeLetters(fakeAdmin(inserted) as never, 'u1', [
      { type: 'visit', payload: { region: 'world' } },
      { type: 'letter', payload: { text: '안녕하세요' } },
    ] as never, TS);
    expect(inserted).toEqual([{ user_id: 'u1', text: '안녕하세요', created_at: TS }]);
  });

  it('본문이 문자열이 아닌 letter 이벤트는 건너뛴다(방어)', async () => {
    const inserted: unknown[] = [];
    await writeLetters(fakeAdmin(inserted) as never, 'u1', [
      { type: 'letter', payload: { text: 42 } },
    ] as never, TS);
    expect(inserted).toEqual([]);
  });

  it('insert 실패는 500 ApiError로 던진다', async () => {
    await expect(writeLetters(
      fakeAdmin([], { message: 'boom' }) as never, 'u1',
      [{ type: 'letter', payload: { text: '안녕' } }] as never, TS,
    )).rejects.toMatchObject({ status: 500, code: 'db-write' });
  });
});
