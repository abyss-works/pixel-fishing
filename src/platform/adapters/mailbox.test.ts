// 우편함 읽기 어댑터 — 응답의 items 배열을 정규화해 매핑하는지 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({ isCloud: true }));

import { readMails } from './mailbox';

describe('우편함 HTTP 어댑터', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('readMails는 첨부 items를 배열로 매핑하고 누락된 경우 빈 배열로 채운다', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      mails: [
        {
          id: 1, title: '물약 선물', body: '본문', gold: 0,
          items: [{ id: 'luck-small', qty: 2 }],
          createdAt: '2026-11-25T00:00:00.000Z', readAt: null, claimedAt: null,
        },
        {
          id: 2, title: '골드만', body: '본문', gold: 100,
          createdAt: '2026-11-24T00:00:00.000Z', readAt: null, claimedAt: null,
        },
      ],
    }), { status: 200 }));
    const mails = await readMails();
    expect(mails).toEqual([
      {
        id: 1, title: '물약 선물', body: '본문', gold: 0,
        items: [{ id: 'luck-small', qty: 2 }],
        createdAt: '2026-11-25T00:00:00.000Z', readAt: null, claimedAt: null,
      },
      {
        id: 2, title: '골드만', body: '본문', gold: 100,
        items: [],
        createdAt: '2026-11-24T00:00:00.000Z', readAt: null, claimedAt: null,
      },
    ]);
  });
});
