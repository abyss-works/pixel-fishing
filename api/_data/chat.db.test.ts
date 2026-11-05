// 채팅 모듈 — 실제 Postgres에서 저장·제재 거부, 최근 대화의 차단 제외, 신고 복사, 보관 기간 정리를 검사한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { seedUser } from '../_dbTest/actionHarness.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { block } from './blocks.js';
import { deleteExpiredChat, recentChat, reportChat, saveChat } from './chat.js';

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
beforeEach(async () => {
  await client.query('delete from public.chat_reports');
  await client.query('delete from public.chat_messages');
});

async function user(restricted = false): Promise<string> {
  const uid = randomUUID();
  return seedUser(client, { uid, email: `${uid}@example.test`, nickname: null, ...(restricted ? { state: {}, restricted } : {}) });
}

/** 시각을 지정해 메시지를 넣는다 */
async function message(uid: string, text: string, createdAt = new Date().toISOString()): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    'insert into public.chat_messages (user_id, nick, text, created_at) values ($1, $2, $3, $4) returning id',
    [uid, `n-${uid.slice(0, 4)}`, text, createdAt]);
  return Number(rows[0].id);
}

describe('chat', () => {
  it('저장하면 서버가 붙인 이름과 시각이 담긴 줄을 돌려주고, 제재된 계정은 저장하지 않는다', async () => {
    const [a, banned] = [await user(), await user(true)];
    const line = await saveChat(database.db, a, '가람', '안녕하세요');
    expect(line).toMatchObject({ uid: a, nick: '가람', text: '안녕하세요' });
    expect(line?.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(await saveChat(database.db, banned, '나쁜', '도배')).toBeNull();
    const { rows } = await client.query('select user_id from public.chat_messages');
    expect(rows).toEqual([{ user_id: a }]);
  });

  it('최근 대화는 최신 limit개를 오래된 순으로 주고, 내가 차단한 사람의 메시지는 뺀다', async () => {
    const [me, friend, rude] = [await user(), await user(), await user()];
    await message(friend, '하나');
    await message(rude, '둘');
    await message(friend, '셋');
    await message(friend, '넷');
    expect((await recentChat(database.db, me, 3)).map(l => l.text)).toEqual(['둘', '셋', '넷']);
    await block(database.db, me, rude);
    expect((await recentChat(database.db, me, 3)).map(l => l.text)).toEqual(['하나', '셋', '넷']);
    // 차단은 차단한 사람에게만 적용된다
    expect((await recentChat(database.db, friend, 10)).map(l => l.text)).toEqual(['하나', '둘', '셋', '넷']);
  });

  it('신고는 그 메시지와 앞뒤 다섯 줄을 복사하고, 같은 사람의 같은 신고는 한 건이며, 없는 메시지는 false다', async () => {
    const [reporter, other, rude] = [await user(), await user(), await user()];
    const ids: number[] = [];
    for (let i = 0; i < 13; i++) ids.push(await message(i === 6 ? rude : other, `줄${i}`));
    const now = '2030-01-01T00:00:00.000Z';
    expect(await reportChat(database.db, reporter, ids[6], now)).toBe(true);
    expect(await reportChat(database.db, reporter, ids[6], now)).toBe(true);
    expect(await reportChat(database.db, other, ids[6], now)).toBe(true);
    expect(await reportChat(database.db, reporter, 999_999_999, now)).toBe(false);
    const { rows } = await client.query<{ user_id: string; message_id: string; target_id: string; lines: { text: string; uid: string }[] }>(
      'select user_id, message_id, target_id, lines from public.chat_reports order by id');
    expect(rows.map(r => r.user_id)).toEqual([reporter, other]);
    expect(rows[0]).toMatchObject({ message_id: String(ids[6]), target_id: rude });
    expect(rows[0].lines.map(l => l.text)).toEqual(['줄1', '줄2', '줄3', '줄4', '줄5', '줄6', '줄7', '줄8', '줄9', '줄10', '줄11']);
    expect(rows[0].lines[5].uid).toBe(rude);
  });

  it('길드 채팅은 그 길드원만 저장하고, 최근 대화와 신고 복사는 방(월드·길드)을 섞지 않는다', async () => {
    const [member, outsider] = [await user(), await user()];
    const { rows: [g] } = await client.query<{ id: string }>(`insert into public.guilds (name) values ($1) returning id`,
      [`g${member.slice(0, 6)}`]);
    await client.query(`insert into public.guild_members (guild_id, user_id, role) values ($1, $2, 'leader')`, [g.id, member]);
    await message(outsider, '월드1');
    const guildLine = await saveChat(database.db, member, '가람', '길드1', g.id);
    expect(guildLine).toMatchObject({ text: '길드1' });
    expect(await saveChat(database.db, outsider, '나루', '끼어들기', g.id)).toBeNull();
    await message(outsider, '월드2');
    expect((await recentChat(database.db, member, 10)).map(l => l.text)).toEqual(['월드1', '월드2']);
    expect((await recentChat(database.db, member, 10, g.id)).map(l => l.text)).toEqual(['길드1']);
    expect(await reportChat(database.db, outsider, guildLine?.id ?? 0, '2030-01-01T00:00:00.000Z')).toBe(true);
    const { rows } = await client.query<{ lines: { text: string }[] }>('select lines from public.chat_reports');
    expect(rows[0].lines.map(l => l.text)).toEqual(['길드1']);
    // 길드에서 떠나면 길드 채팅을 저장하지 않는다
    await client.query('update public.guild_members set left_at = now(), role = $3 where guild_id = $1 and user_id = $2',
      [g.id, member, 'member']);
    expect(await saveChat(database.db, member, '가람', '길드2', g.id)).toBeNull();
  });

  it('보관 기간 정리는 30일이 지난 메시지와 1년이 지난 신고만 지운다', async () => {
    const [a, b] = [await user(), await user()];
    const now = '2030-03-01T00:00:00.000Z';
    const day = 86_400_000;
    const ago = (days: number) => new Date(Date.parse(now) - days * day).toISOString();
    const old = await message(a, '오래됨', ago(30.5));
    await message(a, '최근', ago(29.5));
    await client.query(`insert into public.chat_reports (user_id, message_id, target_id, lines, created_at) values
      ($1, $3, $2, '[]', $4), ($1, $3 + 1, $2, '[]', $5)`, [b, a, old, ago(366), ago(364)]);
    expect(await deleteExpiredChat(database.db, now)).toEqual({ messages: 1, reports: 1 });
    expect((await client.query('select text from public.chat_messages')).rows).toEqual([{ text: '최근' }]);
    expect((await client.query('select count(*)::int as n from public.chat_reports')).rows[0].n).toBe(1);
  });
});
