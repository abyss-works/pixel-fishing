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
  allPlayerIds, claimMailFragment, claimableGold, draftProblems, isPending, listMails, markMailRead,
  previewMails, recentSentMails, sendMails,
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
  await client.query('insert into auth.users (id, email, is_anonymous) values ($1, null, true)', [uid]);
  if (withSave) {
    await client.query(`insert into public.saves_current (user_id, data, restricted) values ($1, '{}', $2)`, [uid, restricted]);
  }
  return uid;
}

describe('보내기', () => {
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
    expect(preview).toEqual({ count: 2, totalGold: 100, missing: [ghost] });
    expect(await listMails(database.db, a)).toEqual([]);

    expect(await sendMails(database.db, draft, NOW)).toBe(2);
    const [mail] = await listMails(database.db, a);
    expect(mail).toMatchObject({ title: '환급', body: '차액을 돌려드려요.', gold: 100, createdAt: NOW, readAt: null, claimedAt: null });
    expect((await listMails(database.db, b))[0].gold).toBe(0);
    const sent = await recentSentMails(database.db);
    expect(sent.filter(m => [a, b].includes(m.userId))).toHaveLength(2);
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

  it('할 일이 남은 우편 — 골드 우편은 받기 전, 글 우편은 읽기 전', () => {
    expect(isPending({ gold: 10, readAt: NOW, claimedAt: null })).toBe(true);
    expect(isPending({ gold: 10, readAt: NOW, claimedAt: NOW })).toBe(false);
    expect(isPending({ gold: 0, readAt: null, claimedAt: null })).toBe(true);
    expect(isPending({ gold: 0, readAt: NOW, claimedAt: null })).toBe(false);
  });

  it('받을 골드는 본인의 받지 않은 골드 우편에만 있고, 받기 조각은 확정 조건이 참일 때 한 번만 쓴다', async () => {
    const me = await user();
    const other = await user();
    await sendMails(database.db, { title: '골드', body: 'b', recipients: [{ userId: me, gold: 300 }] }, NOW);
    await sendMails(database.db, { title: '글', body: 'b', recipients: [{ userId: me, gold: 0 }] }, NOW);
    const [gold, text] = (await listMails(database.db, me)).sort((x, y) => y.gold - x.gold);
    expect(await claimableGold(database.db, me, gold.id)).toBe(300);
    expect(await claimableGold(database.db, me, text.id)).toBeNull();
    expect(await claimableGold(database.db, other, gold.id)).toBeNull();

    // 확정 조건이 거짓이면 쓰지 않는다
    await database.db.execute(claimMailFragment(sql`false`, me, gold.id, NOW));
    expect(await claimableGold(database.db, me, gold.id)).toBe(300);

    await database.db.execute(claimMailFragment(sql`true`, me, gold.id, NOW));
    await database.db.execute(claimMailFragment(sql`true`, me, gold.id, LATER));
    const claimed = (await listMails(database.db, me)).find(m => m.id === gold.id)!;
    expect(claimed.claimedAt).toBe(NOW);
    expect(claimed.readAt).toBe(NOW);
    expect(await claimableGold(database.db, me, gold.id)).toBeNull();
  });
});
