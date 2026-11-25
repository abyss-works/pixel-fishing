// 관리자 우편 모듈 단위 테스트 — DB 없이 검증 규칙·상한·중복 수신자·멱등 키 캐시·최근 중복 창을 확인한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Executor } from '../_db/client.js';
import {
  clearMailIdempotencyCache, deliverMail, draftProblems, DuplicateMailError,
  duplicateRecipientIds, MAIL_IDEMPOTENCY_TTL_MS, MAX_MAIL_BATCH_TOTAL_GOLD,
  parseMailRequest, planMail,
} from './mailbox.js';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const NOW = '2026-11-22T00:00:00.000Z';

function mockExecutor(opts: {
  foundIds?: string[];
  allIds?: string[];
  hasDuplicateRow?: boolean;
  sentCount?: number;
} = {}): Executor {
  const foundIds = opts.foundIds ?? [A, B];
  const allIds = opts.allIds ?? [A, B];
  let callIndex = 0;
  return {
    execute: vi.fn(async (query: unknown) => {
      const text = JSON.stringify(query);
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
  } as unknown as Executor;
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

  it('동시 요청(mailInFlight) 합류 시 본문이 다르면 DuplicateMailError, invalid 요청은 검증 결과, 동일 요청은 idempotent=true를 돌려준다', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const db = {
      execute: vi.fn(async (query: unknown) => {
        const text = JSON.stringify(query);
        if (text.includes('join auth.users u') && !text.includes('insert into public.mails')) {
          return { rows: [{ id: A }] };
        }
        if (text.includes('as found')) {
          await gate;
          return { rows: [{ found: false }] };
        }
        if (text.includes('insert into public.mails')) {
          return { rows: [{ n: 1 }] };
        }
        return { rows: [] };
      }),
    } as unknown as Executor;

    const req = {
      title: '동시', body: '본문',
      target: { kind: 'users' as const, recipients: [{ userId: A, gold: 50 }] },
      idempotencyKey: 'inflight-key',
    };

    const p1 = deliverMail(db, req, NOW);
    await Promise.resolve();

    // invalid 요청은 합류·충돌 없이 각자 검증 문제를 받는다
    await expect(deliverMail(db, { ...req, title: ' ' }, NOW)).resolves.toEqual({
      problems: ['title'], preview: null, sent: 0,
    });
    // 본문이 다른 동시 요청은 409 충돌 오류를 받는다
    await expect(deliverMail(db, { ...req, body: '다른 본문' }, NOW)).rejects.toBeInstanceOf(DuplicateMailError);
    // 동일 요청 합류는 첫 요청이 끝난 뒤 idempotent=true를 받는다
    const pSame = deliverMail(db, req, NOW);

    release();
    expect(await p1).toMatchObject({ problems: [], sent: 1 });
    expect(await pSame).toMatchObject({ problems: [], sent: 0, idempotent: true });
  });
});
