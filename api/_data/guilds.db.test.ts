// 길드 모듈 — 실제 Postgres에서 만들기, 초대 코드, 가입, 떠나기·내보내기, 위임, 조회, 계정 정리를 검사한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import {
  createGuild, deleteUserGuild, guildIdOf, handOver, issueInvite, joinGuild, myGuild, removeMember,
} from './guilds.js';

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

const NOW = '2026-11-05T03:00:00.000Z';
const LATER = '2026-11-05T04:00:00.000Z';
let seq = 0;

async function user(): Promise<string> {
  const uid = randomUUID();
  await client.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, false)', [uid, `${uid}@test.dev`]);
  await client.query('insert into public.profiles (user_id, nickname) values ($1, $2)', [uid, `u${seq++}`]);
  return uid;
}

const code = () => `C${String(seq++).padStart(7, '2').replace(/[01]/g, '9')}`;
const tx = () => database.withTransaction;

/** 길드장 하나와 길드원 n명이 있는 길드 */
async function guildWith(n: number): Promise<{ id: string; leader: string; members: string[] }> {
  const leader = await user();
  const created = await createGuild(tx(), leader, `g${seq++}`, NOW);
  if (!created.ok) throw new Error(created.error);
  const c = code();
  await issueInvite(database.db, leader, created.id, c, NOW);
  const members: string[] = [];
  for (let i = 0; i < n; i++) {
    const m = await user();
    await joinGuild(tx(), m, c, NOW);
    members.push(m);
  }
  return { id: created.id, leader, members };
}

describe('guilds', () => {
  it('만들면 만든 사람이 길드장이고, 이름은 대소문자를 무시하고 겹칠 수 없으며, 한 사람은 길드 하나에만 속한다', async () => {
    const a = await user();
    const b = await user();
    const made = await createGuild(tx(), a, 'DeepSea', NOW);
    expect(made).toMatchObject({ ok: true });
    expect(await createGuild(tx(), b, 'deepsea', NOW)).toEqual({ ok: false, error: 'name-taken' });
    expect(await createGuild(tx(), a, 'Other', NOW)).toEqual({ ok: false, error: 'already-in-guild' });
    const view = await myGuild(database.db, a, NOW);
    expect(view).toMatchObject({ name: 'DeepSea', role: 'leader', invite: null, createdAt: NOW,
      members: [{ uid: a, role: 'leader', joinedAt: NOW, leftAt: null }] });
    expect(await myGuild(database.db, b, NOW)).toBeNull();
  });

  it('길드장만 초대 코드를 발급하고, 다시 발급하면 이전 코드는 쓸 수 없으며, 만료된 코드도 쓸 수 없다', async () => {
    const g = await guildWith(1);
    expect(await issueInvite(database.db, g.members[0], g.id, code(), NOW)).toEqual({ ok: false, error: 'not-leader' });
    expect(await issueInvite(database.db, await user(), g.id, code(), NOW)).toEqual({ ok: false, error: 'not-member' });
    const first = code();
    const second = code();
    await issueInvite(database.db, g.leader, g.id, first, NOW);
    expect(await issueInvite(database.db, g.leader, g.id, second, NOW))
      .toEqual({ ok: true, code: second, expiresAt: '2026-11-06T03:00:00.000Z' });
    expect((await myGuild(database.db, g.leader, NOW))?.invite).toEqual({ code: second, expiresAt: '2026-11-06T03:00:00.000Z' });
    expect((await myGuild(database.db, g.members[0], NOW))?.invite).toBeNull();
    const c = await user();
    expect(await joinGuild(tx(), c, first, NOW)).toEqual({ ok: false, error: 'bad-code' });
    expect(await joinGuild(tx(), c, second, '2026-11-06T03:00:00.000Z')).toEqual({ ok: false, error: 'bad-code' });
    expect(await joinGuild(tx(), c, second, LATER)).toEqual({ ok: true, id: g.id });
    expect(await guildIdOf(database.db, c)).toBe(g.id);
  });

  it('길드원이 10명이면 더 들어올 수 없고, 다른 길드에 있으면 들어올 수 없다', async () => {
    const g = await guildWith(9);
    const c = code();
    await issueInvite(database.db, g.leader, g.id, c, NOW);
    expect(await joinGuild(tx(), await user(), c, NOW)).toEqual({ ok: false, error: 'guild-full' });
    expect(await joinGuild(tx(), g.members[0], c, NOW)).toEqual({ ok: false, error: 'already-in-guild' });
    const other = await guildWith(0);
    expect(await joinGuild(tx(), other.leader, c, NOW)).toEqual({ ok: false, error: 'already-in-guild' });
  });

  it('떠난 선원은 기록이 남고, 바로 다른 길드에 들어갈 수 있으며, 같은 길드에 돌아오면 같은 행이 되살아난다', async () => {
    const g = await guildWith(2);
    const [m1, m2] = g.members;
    expect(await removeMember(tx(), m1, g.id, m1, LATER)).toEqual({ ok: true, result: 'left' });
    const view = await myGuild(database.db, g.leader, LATER);
    expect(view?.members.map(m => [m.uid, m.leftAt])).toEqual([[g.leader, null], [m2, null], [m1, LATER]]);
    expect(await myGuild(database.db, m1, LATER)).toBeNull();
    const other = await guildWith(0);
    const oc = code();
    await issueInvite(database.db, other.leader, other.id, oc, LATER);
    expect(await joinGuild(tx(), m1, oc, LATER)).toMatchObject({ ok: true });
    expect(await removeMember(tx(), m1, other.id, m1, LATER)).toMatchObject({ ok: true });
    const gc = code();
    await issueInvite(database.db, g.leader, g.id, gc, LATER);
    expect(await joinGuild(tx(), m1, gc, LATER)).toMatchObject({ ok: true });
    const back = await myGuild(database.db, m1, LATER);
    expect(back?.members.filter(m => m.uid === m1)).toEqual([expect.objectContaining({ role: 'member', leftAt: null, joinedAt: LATER })]);
  });

  it('내보내기는 길드장만 하고, 길드장은 다른 길드원이 있으면 위임한 뒤에 떠날 수 있으며, 혼자 떠나면 길드가 없어진다', async () => {
    const g = await guildWith(2);
    const [m1, m2] = g.members;
    expect(await removeMember(tx(), m1, g.id, m2, NOW)).toEqual({ ok: false, error: 'not-leader' });
    expect(await removeMember(tx(), g.leader, g.id, g.leader, NOW)).toEqual({ ok: false, error: 'handover-first' });
    expect(await removeMember(tx(), g.leader, g.id, m2, NOW)).toEqual({ ok: true, result: 'kicked' });
    expect(await removeMember(tx(), g.leader, g.id, m2, NOW)).toEqual({ ok: false, error: 'not-member' });
    expect(await handOver(tx(), m1, g.id, g.leader)).toEqual({ ok: false, error: 'not-leader' });
    expect(await handOver(tx(), g.leader, g.id, g.leader)).toEqual({ ok: false, error: 'self' });
    expect(await handOver(tx(), g.leader, g.id, m2)).toEqual({ ok: false, error: 'not-member' });
    expect(await handOver(tx(), g.leader, g.id, m1)).toEqual({ ok: true });
    expect((await myGuild(database.db, m1, NOW))?.role).toBe('leader');
    expect(await removeMember(tx(), g.leader, g.id, g.leader, NOW)).toEqual({ ok: true, result: 'left' });
    await client.query(`insert into public.chat_messages (user_id, nick, text, guild_id) values ($1, 'n', '길드', $2)`, [m1, g.id]);
    expect(await removeMember(tx(), m1, g.id, m1, NOW)).toEqual({ ok: true, result: 'dissolved' });
    expect((await client.query('select 1 from public.guilds where id = $1', [g.id])).rows).toEqual([]);
    expect((await client.query('select 1 from public.chat_messages where guild_id = $1', [g.id])).rows).toEqual([]);
  });

  it('계정 정리는 그 사람의 길드원 행을 지우고, 길드장이면 가장 먼저 들어온 길드원에게 넘기며, 혼자면 길드를 없앤다', async () => {
    const g = await guildWith(2);
    await client.query('update public.guild_members set joined_at = $3 where guild_id = $1 and user_id = $2',
      [g.id, g.members[0], LATER]);
    await deleteUserGuild(database.db, g.leader);
    const view = await myGuild(database.db, g.members[1], NOW);
    expect(view?.role).toBe('leader');
    expect(view?.members.map(m => m.uid)).toEqual([g.members[1], g.members[0]]);
    const solo = await guildWith(0);
    await deleteUserGuild(database.db, solo.leader);
    expect((await client.query('select 1 from public.guilds where id = $1', [solo.id])).rows).toEqual([]);
  });
});
