// 관리자 우편 모듈 단위 테스트 — DB 없이 검증 규칙·상한·중복 수신자·멱등 키 캐시·최근 중복 창을 확인한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Executor } from '../_db/client.js';
import {
  clearMailIdempotencyCache, deliverMail, draftProblems, DuplicateMailError,
  duplicateRecipientIds, MAIL_IDEMPOTENCY_TTL_MS, MAX_MAIL_BATCH_TOTAL_GOLD,
  parseMailRequest, planMail, sendIdempotentMail,
} from './mailbox.js';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const NOW = '2026-11-22T00:00:00.000Z';

function extractQueryParts(query: unknown): { text: string; params: unknown[] } {
  const chunks = (query as { queryChunks?: unknown[] })?.queryChunks ?? [];
  let text = '';
  const params: unknown[] = [];
  for (const chunk of chunks) {
    if (typeof chunk === 'object' && chunk !== null && 'queryChunks' in chunk) {
      const nested = extractQueryParts(chunk);
      text += nested.text;
      params.push(...nested.params);
    } else if (typeof chunk === 'object' && chunk !== null && 'value' in chunk && Array.isArray((chunk as { value: unknown }).value)) {
      text += (chunk as { value: string[] }).value.join('');
    } else if (typeof chunk === 'object' && chunk !== null && 'value' in chunk) {
      params.push((chunk as { value: unknown }).value);
    } else {
      params.push(chunk);
    }
  }
  return { text, params };
}

function mockExecutor(opts: {
  foundIds?: string[];
  allIds?: string[];
  hasDuplicateRow?: boolean;
  sentCount?: number;
} = {}): Executor {
  const foundIds = opts.foundIds ?? [A, B];
  const allIds = opts.allIds ?? [A, B];
  let callIndex = 0;
  let idempotencyStore = new Map<string, { fingerprint: string; result: unknown; expires_at: string }>();

  const exec = {
    execute: vi.fn(async (query: unknown) => {
      const { text, params } = extractQueryParts(query);
      if (text.includes('insert into public.admin_mail_idempotency')) {
        const [key, fingerprint, expires_at] = params as [string, string, string];
        if (idempotencyStore.has(key)) return { rows: [] };
        idempotencyStore.set(key, { fingerprint, result: null, expires_at });
        return { rows: [{ key }] };
      }
      if (text.includes('from public.admin_mail_idempotency') && text.includes('for update')) {
        const [key] = params as [string];
        const entry = idempotencyStore.get(key);
        return { rows: entry ? [entry] : [] };
      }
      if (text.includes('delete from public.admin_mail_idempotency')) {
        const [key] = params as [string];
        if (key) idempotencyStore.delete(key);
        else idempotencyStore.clear();
        return { rows: [] };
      }
      if (text.includes('update public.admin_mail_idempotency')) {
        const [rawResult, expires_at, key] = params as [string, string, string];
        const entry = idempotencyStore.get(key);
        if (entry) {
          entry.result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
          entry.expires_at = expires_at;
        }
        return { rows: [] };
      }
      if (text.includes('from public.saves_current')) {
        return { rows: allIds.map(id => ({ id })) };
      }
      if (text.includes('join auth.users u') && !text.includes('insert into public.mails')) {
        return { rows: foundIds.map(id => ({ id })) };
      }
      if (text.includes('as found')) {
        return { rows: [{ found: Boolean(opts.hasDuplicateRow) }] };
      }
      if (text.includes('insert into public.mails')) {
        callIndex++;
        return { rows: [{ n: opts.sentCount ?? foundIds.length, callIndex }] };
      }
      return { rows: [] };
    }),
    transaction: async <T>(work: (tx: Executor) => Promise<T>): Promise<T> => {
      const snapshot = new Map(
        [...idempotencyStore.entries()].map(([k, v]) => [k, { ...v }]),
      );
      try {
        return await work(exec as unknown as Executor);
      } catch (err) {
        idempotencyStore = snapshot;
        throw err;
      }
    },
  };
  return exec as unknown as Executor;
}

afterEach(() => {
  clearMailIdempotencyCache();
  vi.useRealTimers();
});

describe('우편 요청 해석 및 중복/상한 검증', () => {
  it('duplicateRecipientIds는 대소문자와 앞뒤 공백을 무시해 중복 uid를 정규화 목록으로 돌려준다', () => {
    expect(duplicateRecipientIds([
      { userId: A, gold: 10 },
      { userId: B, gold: 20 },
      { userId: ` ${A.toUpperCase()} `, gold: 30 },
      { userId: A, gold: 40 },
    ])).toEqual([A]);
  });

  it('parseMailRequest는 선택적 idempotencyKey·items·생략된 gold를 해석·보존한다', () => {
    const base = { title: 't', body: 'b', target: { kind: 'all', gold: 5 } };
    expect(parseMailRequest(base)).toEqual(base);
    expect(parseMailRequest({ ...base, idempotencyKey: '  key-1  ' })).toEqual({ ...base, idempotencyKey: 'key-1' });
    expect(parseMailRequest({ ...base, idempotencyKey: '' })).toBeNull();
    expect(parseMailRequest({ ...base, idempotencyKey: 123 })).toBeNull();

    expect(parseMailRequest({
      title: 't', body: 'b',
      target: { kind: 'all', items: [{ id: 'luck-small', qty: 2 }] },
    })).toEqual({
      title: 't', body: 'b',
      target: { kind: 'all', gold: 0, items: [{ id: 'luck-small', qty: 2 }] },
    });
    expect(parseMailRequest({
      title: 't', body: 'b',
      items: [{ id: 'luck-small', qty: 1 }],
      target: { kind: 'users', recipients: [{ userId: A }] },
    })).toEqual({
      title: 't', body: 'b',
      items: [{ id: 'luck-small', qty: 1 }],
      target: { kind: 'users', recipients: [{ userId: A, gold: 0 }] },
    });
    expect(parseMailRequest({
      title: 't', body: 'b',
      items: 'bad',
      target: { kind: 'all', gold: 0 },
    })).toBeNull();
    expect(parseMailRequest({
      title: 't', body: 'b',
      target: { kind: 'all', gold: 0, items: [{ id: 'luck-small', qty: '1' }] },
    })).toBeNull();
  });

  it('draftProblems는 골드·아이템 모두 비면 거부하고, items 카탈로그·정수 수량·저장 상한·중복 id를 검증한다', () => {
    expect(draftProblems({
      title: '제목', body: '본문',
      recipients: [{ userId: A, gold: 0 }],
    })).toContain('empty');

    expect(draftProblems({
      title: '제목', body: '본문',
      recipients: [{ userId: A, gold: 0, items: [{ id: 'luck-small', qty: 2 }, { id: 'energy-common', qty: 5 }] }],
    })).toEqual([]);

    expect(draftProblems({
      title: '제목', body: '본문',
      recipients: [{ userId: A, gold: 0, items: [{ id: 'unknown-item', qty: 1 }] }],
    })).toContain('items');

    expect(draftProblems({
      title: '제목', body: '본문',
      recipients: [{ userId: A, gold: 0, items: [{ id: 'luck-small', qty: 0 }] }],
    })).toContain('items');

    expect(draftProblems({
      title: '제목', body: '본문',
      recipients: [{ userId: A, gold: 0, items: [{ id: 'luck-small', qty: 1.5 }] }],
    })).toContain('items');

    // 생명의 기운은 1개당 저장 단위 10이므로 100,001개는 ITEM_CAP(1,000,000)을 초과한다
    expect(draftProblems({
      title: '제목', body: '본문',
      recipients: [{ userId: A, gold: 0, items: [{ id: 'energy-common', qty: 100_000 }] }],
    })).toEqual([]);
    expect(draftProblems({
      title: '제목', body: '본문',
      recipients: [{ userId: A, gold: 0, items: [{ id: 'energy-common', qty: 100_001 }] }],
    })).toContain('items');

    expect(draftProblems({
      title: '제목', body: '본문',
      recipients: [{ userId: A, gold: 0, items: [{ id: 'luck-small', qty: 1 }, { id: 'luck-small', qty: 2 }] }],
    })).toContain('items');
  });

  it('deliverMail 멱등 지문은 items 순서 차이를 정규화하고 items 내용이 다르면 DuplicateMailError를 던진다', async () => {
    const db = mockExecutor({ foundIds: [A], sentCount: 1 });
    const req1 = {
      title: '선물', body: '본문',
      target: {
        kind: 'users' as const,
        recipients: [{ userId: A, gold: 0, items: [{ id: 'mat-abyss-lantern', qty: 1 }, { id: 'luck-small', qty: 2 }] }],
      },
      idempotencyKey: 'items-idem-1',
    };
    const first = await deliverMail(db, req1, NOW);
    expect(first).toMatchObject({ problems: [], sent: 1 });

    // 같은 items의 순서만 바꿔 재전송하면 멱등으로 통과한다
    const replay = await deliverMail(db, {
      ...req1,
      target: {
        kind: 'users' as const,
        recipients: [{ userId: A, gold: 0, items: [{ id: 'luck-small', qty: 2 }, { id: 'mat-abyss-lantern', qty: 1 }] }],
      },
    }, NOW);
    expect(replay).toMatchObject({ problems: [], sent: 0, idempotent: true });

    // 같은 키에 items 수량이 다르면 충돌한다
    await expect(deliverMail(db, {
      ...req1,
      target: {
        kind: 'users' as const,
        recipients: [{ userId: A, gold: 0, items: [{ id: 'luck-small', qty: 3 }, { id: 'mat-abyss-lantern', qty: 1 }] }],
      },
    }, NOW)).rejects.toBeInstanceOf(DuplicateMailError);
  });

  it('draftProblems는 중복 수신자를 duplicate로 차단한다', () => {
    expect(draftProblems({
      title: '제목', body: '본문',
      recipients: [{ userId: A, gold: 10 }, { userId: A.toUpperCase(), gold: 20 }],
    })).toContain('duplicate');
  });

  it('planMail은 중복 수신자가 있으면 duplicates 목록과 함께 미리보기를 차단한다', async () => {
    const db = mockExecutor();
    const res = await planMail(db, {
      title: '제목', body: '본문',
      target: { kind: 'users', recipients: [{ userId: A, gold: 10 }, { userId: A.toUpperCase(), gold: 20 }] },
    });
    expect(res).toEqual({ problems: ['duplicate'], duplicates: [A], preview: null });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('총 지급 골드 상한을 넘으면 preview에 capExceeded=true를 내리고 발송을 거부한다', async () => {
    const db = mockExecutor({ allIds: [A, B], foundIds: [A, B] });
    const overAll = {
      title: '보상', body: '본문',
      target: { kind: 'all' as const, gold: Math.floor(MAX_MAIL_BATCH_TOTAL_GOLD / 2) + 1 },
    };
    const plan = await planMail(db, overAll);
    expect(plan.problems).toEqual(['totalGold']);
    expect(plan.preview).toMatchObject({
      recipientCount: 2,
      capExceeded: true,
      maxTotalGold: MAX_MAIL_BATCH_TOTAL_GOLD,
    });
    const sent = await deliverMail(db, overAll, NOW);
    expect(sent).toMatchObject({ problems: ['totalGold'], sent: 0 });
    expect(sent.preview?.capExceeded).toBe(true);
  });

  it('같은 idempotencyKey 재전송은 10분 TTL 안에서 idempotent=true로 차단하고 TTL 뒤에는 새 키처럼 통과한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const db = mockExecutor({ foundIds: [A], sentCount: 1 });
    const req = {
      title: '보상', body: '본문',
      target: { kind: 'users' as const, recipients: [{ userId: A, gold: 100 }] },
      idempotencyKey: 'key-uuid-1',
    };
    const first = await deliverMail(db, req, NOW);
    expect(first).toMatchObject({ problems: [], sent: 1 });
    expect(first.idempotent).toBeUndefined();

    const second = await deliverMail(db, req, NOW);
    expect(second).toMatchObject({ problems: [], sent: 0, idempotent: true });

    vi.advanceTimersByTime(MAIL_IDEMPOTENCY_TTL_MS + 1);
    const third = await deliverMail(db, req, NOW);
    expect(third).toMatchObject({ problems: [], sent: 1 });
  });

  it('최근 중복 창(public.mails)에서 동일 우편이 발견되면 DuplicateMailError를 던진다', async () => {
    const db = mockExecutor({ foundIds: [A], hasDuplicateRow: true });
    await expect(deliverMail(db, {
      title: '보상', body: '본문',
      target: { kind: 'users', recipients: [{ userId: A, gold: 100 }] },
      idempotencyKey: 'fresh-key',
    }, NOW)).rejects.toBeInstanceOf(DuplicateMailError);
  });

  it('존재하는 계정이 한 명도 없으면 recipients 문제로 발송을 거부한다', async () => {
    const db = mockExecutor({ foundIds: [] });
    const req = {
      title: '보상', body: '본문',
      target: { kind: 'users' as const, recipients: [{ userId: A, gold: 100 }] },
      idempotencyKey: 'missing-only-key',
    };
    const plan = await planMail(db, req);
    expect(plan).toMatchObject({ problems: ['recipients'], preview: { count: 0, missing: [A] } });

    const sent = await deliverMail(db, req, NOW);
    expect(sent).toMatchObject({ problems: ['recipients'], sent: 0 });
  });

  it('발송 실패(롤백) 또는 검증 오류 시 멱등 키 점유가 남아 있지 않아 같은 키로 재시도할 수 있다', async () => {
    const req = {
      title: '재시도', body: '본문',
      target: { kind: 'users' as const, recipients: [{ userId: A, gold: 50 }] },
      idempotencyKey: 'rollback-retry-key',
    };

    // 검증 오류는 점유하지 않는다
    const db = mockExecutor({ foundIds: [A], sentCount: 1 });
    await expect(deliverMail(db, { ...req, title: ' ' }, NOW)).resolves.toEqual({
      problems: ['title'], preview: null, sent: 0,
    });

    // 중복 창 충돌로 트랜잭션이 롤백되면 점유가 해제되어 이후 같은 키로 재시도할 수 있다
    const failDb = mockExecutor({ foundIds: [A], hasDuplicateRow: true });
    await expect(deliverMail(failDb, req, NOW)).rejects.toBeInstanceOf(DuplicateMailError);
    await expect(deliverMail(db, req, NOW)).resolves.toMatchObject({ problems: [], sent: 1 });
  });

  it('sendIdempotentMail은 입력·카탈로그·수량·금화 검증 후 입력 순서를 보존하고 중복 id를 합산해 삽입한다', async () => {
    const capturedQueries: string[] = [];
    const db = {
      execute: vi.fn(async (query: unknown) => {
        capturedQueries.push(JSON.stringify(query));
        return { rows: [{ id: 101 }] };
      }),
    } as unknown as Executor;

    const valid = {
      userId: A,
      idempotencyKey: 'google-first-link-reward',
      title: '출항 연결 선물',
      body: '선물을 보냈어요.',
      gold: 0,
      items: [
        { id: 'luck-small', qty: 1 },
        { id: 'cook-lunch-bundle', qty: 1 },
        { id: 'cook-bait-legendary', qty: 3 },
      ],
    };
    await expect(sendIdempotentMail(db, valid, NOW)).resolves.toBe(true);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(capturedQueries[0]).toContain(JSON.stringify(JSON.stringify(valid.items)));

    await expect(sendIdempotentMail(db, {
      ...valid,
      items: [
        { id: 'luck-small', qty: 1 },
        { id: 'cook-lunch-bundle', qty: 1 },
        { id: 'luck-small', qty: 2 },
      ],
    }, NOW)).resolves.toBe(true);
    expect(capturedQueries[1]).toContain(JSON.stringify(JSON.stringify([
      { id: 'luck-small', qty: 3 },
      { id: 'cook-lunch-bundle', qty: 1 },
    ])));

    const dupDb = {
      execute: vi.fn(async () => ({ rows: [] })),
    } as unknown as Executor;
    await expect(sendIdempotentMail(dupDb, valid, NOW)).resolves.toBe(false);

    const badDb = { execute: vi.fn() } as unknown as Executor;
    for (const bad of [
      { ...valid, idempotencyKey: '   ' },
      { ...valid, idempotencyKey: 'k'.repeat(129) },
      { ...valid, userId: 'not-uuid' },
      { ...valid, title: ' ' },
      { ...valid, body: '' },
      { ...valid, gold: -1 },
      { ...valid, items: [{ id: 'unknown-item', qty: 1 }] },
      { ...valid, items: [{ id: 'luck-small', qty: 0 }] },
      { ...valid, items: [{ id: 'luck-small', qty: 2 }, { id: 'luck-small', qty: -1 }] },
      { ...valid, items: [{ id: 'energy-common', qty: 100_001 }] },
      { ...valid, items: [{ id: 'energy-common', qty: 60_000 }, { id: 'energy-common', qty: 40_001 }] },
      { ...valid, gold: 0, items: [] },
      { ...valid, gold: 0, items: [], hats: ['unknown-hat'] },
    ]) {
      await expect(sendIdempotentMail(badDb, bad, NOW)).rejects.toThrow();
    }
    expect(badDb.execute).not.toHaveBeenCalled();

    // 모자 첨부만 있는 멱등 우편은 중복 모자를 제거해 삽입한다
    const hatQueries: string[] = [];
    const hatDb = {
      execute: vi.fn(async (query: unknown) => {
        hatQueries.push(JSON.stringify(query));
        return { rows: [{ id: 102 }] };
      }),
    } as unknown as Executor;
    await expect(sendIdempotentMail(hatDb, {
      userId: A,
      idempotencyKey: 'hat-gift',
      title: '산타모자 선물',
      body: '본문',
      gold: 0,
      items: [],
      hats: ['santa-hat', 'santa-hat'],
    }, NOW)).resolves.toBe(true);
    expect(hatQueries[0]).toContain(JSON.stringify(JSON.stringify(['santa-hat'])));
  });

  it('parseMailRequest·draftProblems·deliverMail은 모자 첨부(hats)를 검증하고 중복을 제거한다', async () => {
    expect(parseMailRequest({
      title: 't', body: 'b',
      target: { kind: 'all', hats: ['santa-hat'] },
    })).toEqual({
      title: 't', body: 'b',
      target: { kind: 'all', gold: 0, hats: ['santa-hat'] },
    });
    expect(parseMailRequest({
      title: 't', body: 'b',
      hats: ['santa-hat'],
      target: { kind: 'users', recipients: [{ userId: A }] },
    })).toEqual({
      title: 't', body: 'b',
      hats: ['santa-hat'],
      target: { kind: 'users', recipients: [{ userId: A, gold: 0 }] },
    });
    expect(parseMailRequest({
      title: 't', body: 'b',
      hats: [123],
      target: { kind: 'all', gold: 0 },
    })).toBeNull();

    expect(draftProblems({
      title: '제목', body: '본문',
      recipients: [{ userId: A, gold: 0, hats: ['santa-hat'] }],
    })).toEqual([]);
    expect(draftProblems({
      title: '제목', body: '본문',
      recipients: [{ userId: A, gold: 0, hats: ['unknown-hat'] }],
    })).toContain('hats');

    const db = mockExecutor({ foundIds: [A], sentCount: 1 });
    const first = await deliverMail(db, {
      title: '모자', body: '본문',
      target: { kind: 'users', recipients: [{ userId: A, gold: 0, hats: ['santa-hat', 'cap-red', 'santa-hat'] }] },
      idempotencyKey: 'hats-idem-1',
    }, NOW);
    expect(first).toMatchObject({ problems: [], sent: 1 });

    // 정렬·중복 제거 후 같은 지문이면 멱등으로 통과한다
    const replay = await deliverMail(db, {
      title: '모자', body: '본문',
      target: { kind: 'users', recipients: [{ userId: A, gold: 0, hats: ['cap-red', 'santa-hat'] }] },
      idempotencyKey: 'hats-idem-1',
    }, NOW);
    expect(replay).toMatchObject({ problems: [], sent: 0, idempotent: true });
  });
});
