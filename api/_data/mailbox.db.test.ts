// 우편 소유 모듈 — 실제 Postgres에서 목록·읽음·받기 조각·보내기를 검사한다.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import {
  allPlayerIds, claimMailFragment, claimableMail, clearMailIdempotencyCache, deliverMail, draftProblems, DuplicateMailError, listMails, markMailRead,
  MAIL_LIST_LIMIT, MAX_MAIL_BATCH_TOTAL_GOLD, parseMailRequest, planMail, previewMails, recentSentMails, sendIdempotentMail, sendMails,
} from './mailbox.js';

let testDb: TestDatabase;
let client: Client;
let database: Database;

beforeAll(async () => {
  testDb = await createTestDatabase();
  client = new Client({ connectionString: testDb.url });
  await client.connect();
  database = createDatabase({ connectionString: testDb.url, max: 2 });
});
afterAll(async () => {
  await database?.pool.end();
  await client?.end();
  await testDb?.drop();
});

const NOW = '2026-10-23T00:00:00.000Z';
const LATER = '2026-10-23T01:00:00.000Z';

async function user(withSave = true, restricted = false): Promise<string> {
  const uid = randomUUID();
  await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, true)`, [uid, `${uid}@anonymous.invalid`]);
  if (withSave) {
    await client.query(`insert into public.saves_current (user_id, data, restricted) values ($1, '{}', $2)`, [uid, restricted]);
  }
  return uid;
}

describe('보내기', () => {
  it('요청 본문 해석 — 지정 계정과 전체 대상, items·생략 gold, 형태가 틀리면 null', () => {
    const id = randomUUID();
    expect(parseMailRequest({ title: 't', body: 'b', target: { kind: 'all', gold: 5 } }))
      .toEqual({ title: 't', body: 'b', target: { kind: 'all', gold: 5 } });
    expect(parseMailRequest({ title: 't', body: 'b', target: { kind: 'users', recipients: [{ userId: id, gold: 1 }] } }))
      .toEqual({ title: 't', body: 'b', target: { kind: 'users', recipients: [{ userId: id, gold: 1 }] } });
    expect(parseMailRequest({ title: 't', body: 'b', target: { kind: 'users', recipients: [{ userId: id }] } }))
      .toEqual({ title: 't', body: 'b', target: { kind: 'users', recipients: [{ userId: id, gold: 0 }] } });
    expect(parseMailRequest({ title: 't', body: 'b', target: { kind: 'all', items: [{ id: 'luck-small', qty: 2 }] } }))
      .toEqual({ title: 't', body: 'b', target: { kind: 'all', gold: 0, items: [{ id: 'luck-small', qty: 2 }] } });
    for (const bad of [null, 'x', { title: 't', body: 'b' }, { title: 't', body: 'b', target: { kind: 'all', gold: '5' } },
      { title: 't', body: 'b', target: { kind: 'users', recipients: 'x' } },
      { title: 't', body: 'b', target: { kind: 'users', recipients: [{ userId: id, gold: '1' }] } },
      { title: 't', body: 'b', target: { kind: 'all', gold: 0, items: [{ id: 'luck-small', qty: '2' }] } },
      { title: 1, body: 'b', target: { kind: 'all', gold: 1 } }]) {
      expect(parseMailRequest(bad)).toBeNull();
    }
  });

  it('전체 대상 — 미리보기와 보내기가 저장 상태가 있는 제재되지 않은 계정에 같은 금액을 쓴다', async () => {
    const live = await user();
    const banned = await user(true, true);
    const req = { title: '전체', body: '모두에게', target: { kind: 'all' as const, gold: 7 } };
    const plan = await planMail(database.db, req);
    expect(plan.problems).toEqual([]);
    expect(plan.preview!.count).toBeGreaterThan(0);
    expect(plan.preview!.totalGold).toBe(plan.preview!.count * 7);
    const out = await deliverMail(database.db, req, NOW);
    expect(out.sent).toBe(out.preview!.count);
    expect((await listMails(database.db, live)).some(m => m.title === '전체' && m.gold === 7)).toBe(true);
    expect((await listMails(database.db, banned)).some(m => m.title === '전체')).toBe(false);
    expect(await deliverMail(database.db, { ...req, title: '' }, NOW)).toEqual({ problems: ['title'], preview: null, sent: 0 });
  });

  it('형태 검증 — 제목·본문·골드·대상·중복', () => {
    const ok = { title: '제목', body: '본문', recipients: [{ userId: randomUUID(), gold: 10 }] };
    expect(draftProblems(ok)).toEqual([]);
    expect(draftProblems({ ...ok, title: ' ' })).toContain('title');
    expect(draftProblems({ ...ok, body: 'x'.repeat(2001) })).toContain('body');
    expect(draftProblems({ ...ok, recipients: [{ userId: ok.recipients[0].userId, gold: -1 }] })).toContain('gold');
    expect(draftProblems({ ...ok, recipients: [{ userId: ok.recipients[0].userId, gold: 1.5 }] })).toContain('gold');
    expect(draftProblems({ ...ok, recipients: [] })).toContain('recipients');
    expect(draftProblems({ ...ok, recipients: [{ userId: 'nope', gold: 0 }] })).toContain('recipients');
    expect(draftProblems({ ...ok, recipients: [ok.recipients[0], ok.recipients[0]] })).toContain('duplicate');
  });

  it('미리보기는 쓰지 않고 계정이 없는 대상을 따로 알려 준다. 보내기는 계정이 있는 대상에게만 넣는다', async () => {
    const a = await user();
    const b = await user();
    const ghost = randomUUID();
    const draft = { title: ' 환급 ', body: ' 차액을 돌려드려요. ', recipients: [{ userId: a, gold: 100 }, { userId: b, gold: 0 }, { userId: ghost, gold: 5 }] };
    const preview = await previewMails(database.db, draft);
    expect(preview).toEqual({
      count: 2,
      recipientCount: 2,
      totalGold: 100,
      capExceeded: false,
      maxTotalGold: MAX_MAIL_BATCH_TOTAL_GOLD,
      missing: [ghost],
    });
    expect(await listMails(database.db, a)).toEqual([]);

    expect(await sendMails(database.db, draft, NOW)).toBe(2);
    const [mail] = await listMails(database.db, a);
    expect(mail).toMatchObject({ title: '환급', body: '차액을 돌려드려요.', gold: 100, createdAt: NOW, readAt: null, claimedAt: null });
    expect((await listMails(database.db, b))[0].gold).toBe(0);
    const sent = await recentSentMails(database.db);
    expect(sent.filter(m => [a, b].includes(m.userId))).toHaveLength(2);
  });

  it('중복 수신자·상한 초과·멱등 키·최근 동일 우편 중복을 차단한다', async () => {
    clearMailIdempotencyCache();
    const a = await user();
    const dupPlan = await planMail(database.db, {
      title: '중복', body: '확인', target: { kind: 'users', recipients: [{ userId: a, gold: 10 }, { userId: a.toUpperCase(), gold: 20 }] },
    });
    expect(dupPlan).toEqual({ problems: ['duplicate'], duplicates: [a.toLowerCase()], preview: null });

    const capPlan = await planMail(database.db, {
      title: '초과', body: '확인', target: { kind: 'users', recipients: [{ userId: a, gold: MAX_MAIL_BATCH_TOTAL_GOLD + 1 }] },
    });
    expect(capPlan.problems).toEqual(['totalGold']);
    expect(capPlan.preview).toMatchObject({ recipientCount: 1, capExceeded: true, maxTotalGold: MAX_MAIL_BATCH_TOTAL_GOLD });
    expect(await deliverMail(database.db, {
      title: '초과', body: '확인', target: { kind: 'users', recipients: [{ userId: a, gold: MAX_MAIL_BATCH_TOTAL_GOLD + 1 }] },
    }, NOW)).toMatchObject({ problems: ['totalGold'], sent: 0 });

    const key = randomUUID();
    const req = { title: '안전장치', body: '본문', target: { kind: 'users' as const, recipients: [{ userId: a, gold: 50 }] }, idempotencyKey: key };
    const first = await deliverMail(database.db, req, NOW);
    expect(first.sent).toBe(1);
    const replay = await deliverMail(database.db, req, NOW);
    expect(replay).toMatchObject({ sent: 0, idempotent: true });

    await expect(deliverMail(database.db, { ...req, idempotencyKey: randomUUID() }, NOW)).rejects.toBeInstanceOf(DuplicateMailError);
  });

  it('전체 대상 발송 뒤 대상 수가 늘어도 10분 창 안에서 같은 내용 중복 발송을 막는다', async () => {
    clearMailIdempotencyCache();
    await user();
    const firstAll = { title: '전체공지', body: '중복차단확인', target: { kind: 'all' as const, gold: 15 }, idempotencyKey: randomUUID() };
    const sent = await deliverMail(database.db, firstAll, NOW);
    expect(sent.sent).toBeGreaterThan(0);

    // 새 플레이어가 추가되어 전체 대상 수가 늘어도 기존 수신자 중복으로 10분 내 재발송을 차단한다
    await user();
    await expect(deliverMail(database.db, { ...firstAll, idempotencyKey: randomUUID() }, '2026-10-23T00:05:00.000Z')).rejects.toBeInstanceOf(DuplicateMailError);
  });

  it('전체 대상은 저장 상태가 있는 제재되지 않은 계정이다', async () => {
    const live = await user();
    const banned = await user(true, true);
    const empty = await user(false);
    const ids = await allPlayerIds(database.db);
    expect(ids).toContain(live);
    expect(ids).not.toContain(banned);
    expect(ids).not.toContain(empty);
  });
});

describe('플레이어 쪽', () => {
  it('목록은 본인 것만 최근 순이고, 읽음은 처음 한 번만 남는다', async () => {
    const me = await user();
    const other = await user();
    await sendMails(database.db, { title: '첫째', body: 'b', recipients: [{ userId: me, gold: 0 }, { userId: other, gold: 0 }] }, NOW);
    await sendMails(database.db, { title: '둘째', body: 'b', recipients: [{ userId: me, gold: 0 }] }, LATER);
    const list = await listMails(database.db, me);
    expect(list.map(m => m.title)).toEqual(['둘째', '첫째']);

    await markMailRead(database.db, me, list[1].id, NOW);
    await markMailRead(database.db, me, list[1].id, LATER);
    await markMailRead(database.db, other, list[0].id, NOW); // 남의 우편은 바뀌지 않는다
    const after = await listMails(database.db, me);
    expect(after[1].readAt).toBe(NOW);
    expect(after[0].readAt).toBeNull();
  });

  it('목록 상한을 넘어도 할 일이 남은 우편은 빠지지 않는다', async () => {
    const me = await user();
    await sendMails(database.db, { title: '오래된 골드', body: 'b', recipients: [{ userId: me, gold: 10 }] }, '2026-01-01T00:00:00.000Z');
    await sendMails(database.db, { title: '오래된 글', body: 'b', recipients: [{ userId: me, gold: 0 }] }, '2026-01-01T00:00:01.000Z');
    const doneAt = '2026-02-01T00:00:00.000Z';
    await client.query(`insert into public.mails (user_id, title, body, gold, created_at, read_at)
      select $1, '읽은 글 ' || g, 'b', 0, $2::timestamptz + g * interval '1 minute', $2::timestamptz
      from generate_series(1, ${MAIL_LIST_LIMIT + 5}) g`, [me, doneAt]);
    const list = await listMails(database.db, me);
    expect(list).toHaveLength(MAIL_LIST_LIMIT + 2);
    expect(list.slice(-2).map(m => m.title)).toEqual(['오래된 글', '오래된 골드']);
    expect(list[0].title).toBe(`읽은 글 ${MAIL_LIST_LIMIT + 5}`);
  });

  it('받을 보상은 본인의 받지 않은 골드·아이템 우편에만 있고, 받기 조각은 확정 조건이 참일 때 한 번만 쓴다', async () => {
    const me = await user();
    const other = await user();
    await sendMails(database.db, { title: '골드', body: 'b', recipients: [{ userId: me, gold: 300 }] }, NOW);
    await sendMails(database.db, {
      title: '아이템만', body: 'b',
      recipients: [{ userId: me, gold: 0, items: [{ id: 'luck-small', qty: 2 }, { id: 'energy-common', qty: 3 }] }],
    }, NOW);
    await sendMails(database.db, { title: '글', body: 'b', recipients: [{ userId: me, gold: 0 }] }, NOW);
    const list = await listMails(database.db, me);
    const gold = list.find(m => m.title === '골드')!;
    const itemOnly = list.find(m => m.title === '아이템만')!;
    const text = list.find(m => m.title === '글')!;
    expect(await claimableMail(database.db, me, gold.id)).toEqual({ gold: 300, items: [] });
    expect(await claimableMail(database.db, me, itemOnly.id)).toEqual({
      gold: 0,
      items: [{ id: 'energy-common', qty: 3 }, { id: 'luck-small', qty: 2 }],
    });
    expect(await claimableMail(database.db, me, text.id)).toBeNull();
    expect(await claimableMail(database.db, other, gold.id)).toBeNull();

    // 확정 조건이 거짓이면 쓰지 않는다
    await database.db.execute(claimMailFragment(sql`false`, me, gold.id, NOW));
    expect(await claimableMail(database.db, me, gold.id)).toEqual({ gold: 300, items: [] });

    await database.db.execute(claimMailFragment(sql`true`, me, gold.id, NOW));
    await database.db.execute(claimMailFragment(sql`true`, me, gold.id, LATER));
    const claimed = (await listMails(database.db, me)).find(m => m.id === gold.id)!;
    expect(claimed.claimedAt).toBe(NOW);
    expect(claimed.readAt).toBe(NOW);
    expect(await claimableMail(database.db, me, gold.id)).toBeNull();
  });

  it('아이템 첨부 우편은 읽어도 미수령이면 목록 상한 밖으로 밀리지 않고, 최근 중복 창도 정규화된 items까지 대조한다', async () => {
    clearMailIdempotencyCache();
    const me = await user();
    const firstItems = [{ id: 'luck-small', qty: 2 }, { id: 'mat-abyss-lantern', qty: 1 }];
    const sent = await deliverMail(database.db, {
      title: '아이템 공지', body: '본문',
      target: { kind: 'users', recipients: [{ userId: me, gold: 0, items: firstItems }] },
      idempotencyKey: randomUUID(),
    }, NOW);
    expect(sent.sent).toBe(1);

    // 같은 items의 순서만 뒤집어 10분 내 재발송하면 중복 차단된다
    await expect(deliverMail(database.db, {
      title: '아이템 공지', body: '본문',
      target: { kind: 'users', recipients: [{ userId: me, gold: 0, items: [...firstItems].reverse() }] },
      idempotencyKey: randomUUID(),
    }, '2026-10-23T00:05:00.000Z')).rejects.toBeInstanceOf(DuplicateMailError);

    // 수량이 다르면 다른 우편이므로 발송된다
    const diffSent = await deliverMail(database.db, {
      title: '아이템 공지', body: '본문',
      target: { kind: 'users', recipients: [{ userId: me, gold: 0, items: [{ id: 'luck-small', qty: 3 }] }] },
      idempotencyKey: randomUUID(),
    }, '2026-10-23T00:06:00.000Z');
    expect(diffSent.sent).toBe(1);

    // 읽은 뒤 상한을 넘는 글 우편이 쌓여도 미수령 아이템 우편은 목록에 남는다
    const [itemMail] = await listMails(database.db, me);
    await markMailRead(database.db, me, itemMail.id, LATER);
    await client.query(`insert into public.mails (user_id, title, body, gold, created_at, read_at)
      select $1, '읽은 글 ' || g, 'b', 0, '2026-11-01T00:00:00Z'::timestamptz + g * interval '1 minute', '2026-11-01T00:00:00Z'::timestamptz
      from generate_series(1, ${MAIL_LIST_LIMIT + 5}) g`, [me]);
    const list = await listMails(database.db, me);
    expect(list.some(m => m.id === itemMail.id)).toBe(true);
    const recent = await recentSentMails(database.db);
    expect(recent.find(m => m.id === itemMail.id)?.items).toEqual([{ id: 'luck-small', qty: 3 }]);
  });

  it('sendIdempotentMail은 (user_id, idempotency_key) 기준으로 최초 1회만 삽입하고 중복은 무시한다', async () => {
    const a = await user(false);
    const b = await user(false);
    const base = {
      idempotencyKey: 'google-first-link-reward',
      title: '출항 연결 선물',
      body: '선물을 보냈어요.',
      gold: 0,
      items: [{ id: 'luck-small', qty: 1 }, { id: 'cook-lunch-bundle', qty: 1 }, { id: 'cook-bait-legendary', qty: 3 }],
    };

    expect(await sendIdempotentMail(database.db, { ...base, userId: a }, NOW)).toBe(true);
    expect(await sendIdempotentMail(database.db, { ...base, userId: a }, LATER)).toBe(false);
    expect(await sendIdempotentMail(database.db, { ...base, userId: b }, NOW)).toBe(true);
    expect(await sendIdempotentMail(database.db, { ...base, userId: a, idempotencyKey: 'other-key' }, LATER)).toBe(true);

    // sendMails(idempotency_key = null)는 같은 계정에도 계속 발송 가능하다
    expect(await sendMails(database.db, { title: '일반1', body: 'b', recipients: [{ userId: a, gold: 10 }] }, NOW)).toBe(1);
    expect(await sendMails(database.db, { title: '일반2', body: 'b', recipients: [{ userId: a, gold: 10 }] }, LATER)).toBe(1);

    const aMails = await listMails(database.db, a);
    expect(aMails.filter(m => m.title === '출항 연결 선물')).toHaveLength(2);
    const firstReward = aMails.find(m => m.title === '출항 연결 선물' && m.createdAt === NOW);
    expect(firstReward).toMatchObject({
      gold: 0,
      items: [
        { id: 'luck-small', qty: 1 },
        { id: 'cook-lunch-bundle', qty: 1 },
        { id: 'cook-bait-legendary', qty: 3 },
      ],
    });

    // 중복 id가 섞여 들어와도 수량은 합산하고 첫 등장 순서를 유지한다
    expect(await sendIdempotentMail(database.db, {
      userId: a,
      idempotencyKey: 'first-appearance-order',
      title: '중복 합산 순서',
      body: '순서 확인',
      gold: 0,
      items: [
        { id: 'luck-small', qty: 1 },
        { id: 'cook-lunch-bundle', qty: 1 },
        { id: 'luck-small', qty: 2 },
      ],
    }, NOW)).toBe(true);
    const mergedMail = (await listMails(database.db, a)).find(m => m.title === '중복 합산 순서');
    expect(mergedMail?.items).toEqual([
      { id: 'luck-small', qty: 3 },
      { id: 'cook-lunch-bundle', qty: 1 },
    ]);
  });
});
