// 길드 모듈 — 실제 Postgres에서 만들기, 가입 방식과 가입 신청, 떠나기·내보내기, 위임, 조회, 미리보기, 계정 정리를 검사한다.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import {
  cancelJoinRequest, createGuild, decideJoinRequest, deleteUserGuild, donateToBonus, guildIdOf, guildPreview, handOver, joinByCode,
  myGuild, myJoinRequest, removeMember, renameGuild, setJoinSettings,
} from './guilds.js';
import { commitAction } from './commit.js';
import { versionUpdate } from './save.js';
import { newState } from '../../src/game/rules/logic.js';
import { GUILD_MAX_MEMBERS } from '../../src/game/rules/guild.js';

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

// 코드 글자(헷갈리는 0 O 1 I L 제외)만 쓰는 테스트용 고유 코드
const code = () => `C${String(seq++).padStart(7, 'A').replace(/0/g, 'X').replace(/1/g, 'Y')}`;
const tx = () => database.withTransaction;

/** 길드를 만들고 고유 코드를 돌려준다 */
async function make(leader: string, name = `g${seq++}`, at = NOW): Promise<{ id: string; code: string }> {
  const c = code();
  const created = await createGuild(tx(), leader, name, c, at);
  if (!created.ok) throw new Error(created.error);
  return { id: created.id, code: c };
}

/** 길드장 하나와 길드원 n명이 있는 자유 가입 길드 */
async function guildWith(n: number): Promise<{ id: string; code: string; leader: string; members: string[] }> {
  const leader = await user();
  const g = await make(leader);
  await setJoinSettings(database.db, leader, g.id, { joinMode: 'open' });
  const members: string[] = [];
  for (let i = 0; i < n; i++) {
    const m = await user();
    const r = await joinByCode(tx(), m, g.code, NOW);
    if (!r.ok) throw new Error(r.error);
    members.push(m);
  }
  return { ...g, leader, members };
}

describe('guilds', () => {
  it('만들면 만든 사람이 길드장이고 승인 가입이다. 이름과 코드는 겹칠 수 없고, 한 사람은 길드 하나에만 속한다', async () => {
    const a = await user();
    const b = await user();
    const made = await make(a, 'DeepSea');
    expect(await createGuild(tx(), b, 'deepsea', code(), NOW)).toEqual({ ok: false, error: 'name-taken' });
    expect(await createGuild(tx(), b, 'Fresh', made.code, NOW)).toEqual({ ok: false, error: 'code-taken' });
    expect(await createGuild(tx(), a, 'Other', code(), NOW)).toEqual({ ok: false, error: 'already-in-guild' });
    const view = await myGuild(database.db, a, NOW);
    expect(view).toMatchObject({ name: 'DeepSea', role: 'leader', code: made.code, joinMode: 'approval', pitch: null, requests: [],
      createdAt: NOW, members: [{ uid: a, role: 'leader', joinedAt: NOW, leftAt: null }] });
    expect(await myGuild(database.db, b, NOW)).toBeNull();
  });

  it('자유 가입은 코드로 바로 들어오고, 닫힘은 받지 않으며, 없는 코드는 bad-code다', async () => {
    const leader = await user();
    const g = await make(leader);
    await setJoinSettings(database.db, leader, g.id, { joinMode: 'open' });
    const c = await user();
    expect(await joinByCode(tx(), c, g.code, NOW)).toEqual({ ok: true, id: g.id, result: 'joined' });
    expect(await guildIdOf(database.db, c)).toBe(g.id);
    await setJoinSettings(database.db, leader, g.id, { joinMode: 'closed' });
    expect(await joinByCode(tx(), await user(), g.code, NOW)).toEqual({ ok: false, error: 'guild-closed' });
    expect(await joinByCode(tx(), await user(), 'ZZZZZZZZ', NOW)).toEqual({ ok: false, error: 'bad-code' });
  });

  it('승인 가입은 신청이 되고 길드장만 신청 목록을 보며, 승인하면 들어오고 거절하면 신청만 사라진다', async () => {
    const leader = await user();
    const g = await make(leader);
    const [a, b] = [await user(), await user()];
    const nickA = (await client.query('select nickname from public.profiles where user_id = $1', [a])).rows[0].nickname;
    expect(await joinByCode(tx(), a, g.code, NOW)).toMatchObject({ ok: true, result: 'requested', leader, nick: nickA });
    expect(await joinByCode(tx(), b, g.code, LATER)).toMatchObject({ ok: true, result: 'requested' });
    expect(await guildIdOf(database.db, a)).toBeNull();
    expect((await myGuild(database.db, leader, LATER))?.requests).toEqual([
      { uid: a, nick: nickA, requestedAt: NOW }, expect.objectContaining({ uid: b, requestedAt: LATER })]);
    expect(await myJoinRequest(database.db, a, LATER)).toMatchObject({ code: g.code, requestedAt: NOW });
    const member = await user();
    await setJoinSettings(database.db, leader, g.id, { joinMode: 'open' });
    await joinByCode(tx(), member, g.code, NOW);
    expect((await myGuild(database.db, member, LATER))?.requests).toEqual([]);
    expect(await decideJoinRequest(tx(), member, g.id, a, true, LATER)).toEqual({ ok: false, error: 'not-leader' });
    expect(await decideJoinRequest(tx(), leader, g.id, a, true, LATER)).toMatchObject({ ok: true });
    expect(await guildIdOf(database.db, a)).toBe(g.id);
    expect(await myJoinRequest(database.db, a, LATER)).toBeNull();
    expect(await decideJoinRequest(tx(), leader, g.id, b, false, LATER)).toMatchObject({ ok: true });
    expect(await guildIdOf(database.db, b)).toBeNull();
    expect(await myJoinRequest(database.db, b, LATER)).toBeNull();
    expect(await decideJoinRequest(tx(), leader, g.id, b, true, LATER)).toEqual({ ok: false, error: 'no-request' });
  });

  it('링크로 오면 승인 가입 길드에도 바로 들어오고, 닫힘과 인원 가득은 링크로도 받지 않는다', async () => {
    const leader = await user();
    const g = await make(leader);
    const a = await user();
    expect(await joinByCode(tx(), a, g.code, NOW, 'link')).toEqual({ ok: true, id: g.id, result: 'joined' });
    expect(await guildIdOf(database.db, a)).toBe(g.id);
    expect(await myJoinRequest(database.db, a, NOW)).toBeNull();
    const pending = await user();
    await joinByCode(tx(), pending, g.code, NOW);
    expect(await myJoinRequest(database.db, pending, NOW)).not.toBeNull();
    await setJoinSettings(database.db, leader, g.id, { joinMode: 'closed' });
    expect(await joinByCode(tx(), pending, g.code, NOW, 'link')).toEqual({ ok: false, error: 'guild-closed' });
    const full = await guildWith(GUILD_MAX_MEMBERS - 1);
    await setJoinSettings(database.db, full.leader, full.id, { joinMode: 'approval' });
    expect(await joinByCode(tx(), await user(), full.code, NOW, 'link')).toEqual({ ok: false, error: 'guild-full' });
  });

  it('신청은 한 사람에 하나라 새 신청이 이전 신청을 바꾸고, 7일이 지나면 사라지며, 스스로 거둘 수 있다', async () => {
    const g1 = await make(await user());
    const g2 = await make(await user());
    const a = await user();
    await joinByCode(tx(), a, g1.code, NOW);
    await joinByCode(tx(), a, g2.code, LATER);
    expect(await myJoinRequest(database.db, a, LATER)).toMatchObject({ code: g2.code });
    expect(await myJoinRequest(database.db, a, '2026-11-12T04:00:00.000Z')).toBeNull();
    await cancelJoinRequest(database.db, a);
    expect(await myJoinRequest(database.db, a, LATER)).toBeNull();
  });

  it('신청한 사람이 그 사이 다른 길드에 들어갔으면 승인하지 않고 신청을 지운다. 들어가면 내 신청은 사라진다', async () => {
    const leader = await user();
    const g = await make(leader);
    const a = await user();
    await joinByCode(tx(), a, g.code, NOW);
    const other = await guildWith(0);
    expect(await joinByCode(tx(), a, other.code, NOW)).toMatchObject({ ok: true, result: 'joined' });
    expect(await myJoinRequest(database.db, a, NOW)).toBeNull();
    const b = await user();
    await joinByCode(tx(), b, g.code, NOW);
    await client.query('insert into public.guild_members (guild_id, user_id) values ($1, $2)', [other.id, b]);
    expect(await decideJoinRequest(tx(), leader, g.id, b, true, NOW)).toEqual({ ok: false, error: 'already-in-guild' });
    expect((await myGuild(database.db, leader, NOW))?.requests).toEqual([]);
  });

  it('가입 방식과 권유 문구는 길드장만 바꾸고, 넘기지 않은 값은 그대로 둔다', async () => {
    const g = await guildWith(1);
    expect(await setJoinSettings(database.db, g.members[0], g.id, { joinMode: 'closed' })).toEqual({ ok: false, error: 'not-leader' });
    expect(await setJoinSettings(database.db, await user(), g.id, { joinMode: 'closed' })).toEqual({ ok: false, error: 'not-member' });
    expect(await setJoinSettings(database.db, g.leader, g.id, { pitch: '같이 가요' })).toEqual({ ok: true, joinMode: 'open', pitch: '같이 가요' });
    expect(await setJoinSettings(database.db, g.leader, g.id, { joinMode: 'approval' })).toEqual({ ok: true, joinMode: 'approval', pitch: '같이 가요' });
    expect(await setJoinSettings(database.db, g.leader, g.id, { pitch: null })).toEqual({ ok: true, joinMode: 'approval', pitch: null });
  });

  it('미리보기는 이름, 레벨, 인원과 상한, 가입 방식만 싣고, 없는 코드는 null이다', async () => {
    const g = await guildWith(2);
    const name = (await myGuild(database.db, g.leader, NOW))?.name;
    expect(await guildPreview(database.db, g.code)).toEqual({ code: g.code, name, level: 1, members: 3, cap: 10, joinMode: 'open' });
    expect(await guildPreview(database.db, 'ZZZZZZZZ')).toBeNull();
  });

  it('길드원이 10명이면 더 들어오거나 승인할 수 없고, 다른 길드에 있으면 들어올 수 없다', async () => {
    const g = await guildWith(8);
    const waiting = await user();
    await setJoinSettings(database.db, g.leader, g.id, { joinMode: 'approval' });
    await joinByCode(tx(), waiting, g.code, NOW);
    await setJoinSettings(database.db, g.leader, g.id, { joinMode: 'open' });
    await joinByCode(tx(), await user(), g.code, NOW);
    expect(await joinByCode(tx(), await user(), g.code, NOW)).toEqual({ ok: false, error: 'guild-full' });
    expect(await decideJoinRequest(tx(), g.leader, g.id, waiting, true, NOW)).toEqual({ ok: false, error: 'guild-full' });
    expect(await joinByCode(tx(), g.members[0], g.code, NOW)).toEqual({ ok: false, error: 'already-in-guild' });
    const other = await guildWith(0);
    await setJoinSettings(database.db, g.leader, g.id, { joinMode: 'open' });
    expect(await joinByCode(tx(), other.leader, g.code, NOW)).toEqual({ ok: false, error: 'already-in-guild' });
  });

  it('떠난 선원은 기록이 남고, 바로 다른 길드에 들어갈 수 있으며, 같은 길드에 돌아오면 같은 행이 되살아난다', async () => {
    const g = await guildWith(2);
    const [m1, m2] = g.members;
    expect(await removeMember(tx(), m1, g.id, m1, LATER)).toEqual({ ok: true, result: 'left' });
    const view = await myGuild(database.db, g.leader, LATER);
    expect(view?.members.map(m => [m.uid, m.leftAt])).toEqual([[g.leader, null], [m2, null], [m1, LATER]]);
    expect(await myGuild(database.db, m1, LATER)).toBeNull();
    const other = await guildWith(0);
    expect(await joinByCode(tx(), m1, other.code, LATER)).toMatchObject({ ok: true });
    expect(await removeMember(tx(), m1, other.id, m1, LATER)).toMatchObject({ ok: true });
    expect(await joinByCode(tx(), m1, g.code, LATER)).toMatchObject({ ok: true });
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

describe('길드 성장과 항해일지', () => {
  const logsOf = async (guildId: string) => (await client.query<{ kind: string; user_id: string }>(
    'select kind, user_id::text from public.guild_logs where guild_id = $1 order by id', [guildId])).rows.map(r => [r.kind, r.user_id]);
  const give = (guildId: string, uid: string | null, day: string, fame: number, clears = 0) => client.query(
    'insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, $2, $3, $4, $5)', [guildId, uid, day, fame, clears]);

  it('만들기·가입·떠나기·내보내기를 항해일지에 남긴다', async () => {
    const g = await guildWith(2);
    const [m1, m2] = g.members;
    await removeMember(tx(), m1, g.id, m1, LATER);
    await removeMember(tx(), g.leader, g.id, m2, LATER);
    expect(await logsOf(g.id)).toEqual([['join', g.leader], ['join', m1], ['join', m2], ['leave', m1], ['kick', m2]]);
    const view = await myGuild(database.db, g.leader, LATER);
    expect(view?.logbook.map(l => [l.kind, l.uid, l.at])).toEqual([['kick', m2, LATER], ['leave', m1, LATER], ['join', m2, NOW],
      ['join', m1, NOW], ['join', g.leader, NOW]]);
    expect(view?.logbook[0]).toMatchObject({ nick: expect.any(String), detail: null, id: expect.any(Number) });
  });

  it('조회는 누적 기여도·레벨·다음 문턱·보너스와 길드원별 누적·오늘 기여를 싣는다. 떠난 선원의 기여도 길드에 남는다', async () => {
    const g = await guildWith(1);
    const [m1] = g.members;
    // NOW(KST 12:00)의 게임 날짜는 2026-11-05다
    await give(g.id, g.leader, '2026-11-05', 400, 500);
    await give(g.id, g.leader, '2026-11-04', 1000);
    await give(g.id, m1, '2026-11-04', 1000, 28_100);
    await removeMember(tx(), m1, g.id, m1, NOW);
    const view = await myGuild(database.db, g.leader, NOW);
    expect(view?.growth).toEqual({ level: 3, total: 31_000, floor: 25_000, next: 50_000 });
    expect(view?.members.map(m => [m.uid, m.contribution])).toEqual([
      [g.leader, { total: 1_900, today: 900 }],
      [m1, { total: 29_100, today: 0 }],
    ]);
  });

  it('계정 정리는 그 사람의 항해일지 줄을 지우고, 기여 행은 사람만 비워 길드의 누적 기여도를 지킨다', async () => {
    const g = await guildWith(1);
    const [m1] = g.members;
    await give(g.id, m1, '2026-11-05', 1000, 9_000);
    await deleteUserGuild(database.db, m1);
    expect(await logsOf(g.id)).toEqual([['join', g.leader]]);
    expect((await client.query('select 1 from public.guild_contributions where user_id = $1', [m1])).rows).toEqual([]);
    expect((await myGuild(database.db, g.leader, NOW))?.growth).toMatchObject({ level: 2, total: 10_000 });
  });
});

describe('길드 보너스 기부', () => {
  /** 저장 상태 행 — 골드와 버전만 의미가 있다 */
  const save = (uid: string, gold: number, opts: { restricted?: boolean } = {}) => client.query(
    `insert into public.saves_current (user_id, data, gold, fame, boat, rod, version, restricted) values ($1, '{}', $2, 0, 0, 1, 2, $3)`,
    [uid, gold, opts.restricted ?? false]);
  const saveOf = async (uid: string) => {
    const { rows: [r] } = await client.query<{ gold: string; version: number }>(
      'select gold, version from public.saves_current where user_id = $1', [uid]);
    return { gold: Number(r.gold), version: Number(r.version) };
  };
  const bonusLogs = async (guildId: string) => (await client.query<{ kind: string; detail: string; value: string }>(
    `select kind, detail, value from public.guild_logs where guild_id = $1 and kind in ('donate', 'bonus-up') order by id`, [guildId]))
    .rows.map(r => [r.kind, r.detail, Number(r.value)]);
  /** 길드 누적 기여도를 total로 맞춘다 — 10,000이면 Lv2, 25,000이면 Lv3 */
  const levelUp = (guildId: string, total: number) => client.query(
    `insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, null, '2026-01-01', 0, $2)`, [guildId, total]);

  it('기부하면 골드를 빼고 저장 버전을 올리며, 모인 골드는 다음 단계로 이어진다. 기부는 항해일지에 남는다', async () => {
    const g = await guildWith(0);
    await levelUp(g.id, 10_000);
    await save(g.leader, 500_000);
    expect(await donateToBonus(tx(), g.leader, g.id, 'sell', 60_000, NOW))
      .toEqual({ ok: true, rank: 1, pool: 60_000, accepted: 60_000, gold: 440_000 });
    expect(await saveOf(g.leader)).toEqual({ gold: 440_000, version: 3 });
    expect(await bonusLogs(g.id)).toEqual([['donate', 'sell', 60_000]]);
  });

  it('비용에 닿으면 단계가 오르고, 상한(길드 레벨)까지 필요한 골드만 받는다. 상한에 닿으면 더 받지 않는다', async () => {
    const g = await guildWith(0);
    await levelUp(g.id, 25_000);
    await save(g.leader, 2_000_000);
    await donateToBonus(tx(), g.leader, g.id, 'sell', 100_000, NOW);
    expect(await donateToBonus(tx(), g.leader, g.id, 'sell', 1_000_000, NOW))
      .toEqual({ ok: true, rank: 3, pool: 0, accepted: 550_000, gold: 1_350_000 });
    expect(await bonusLogs(g.id)).toEqual([['donate', 'sell', 100_000], ['donate', 'sell', 550_000], ['bonus-up', 'sell', 3]]);
    expect(await donateToBonus(tx(), g.leader, g.id, 'sell', 1_000, NOW)).toEqual({ ok: false, error: 'rank-maxed' });
    expect(await saveOf(g.leader)).toEqual({ gold: 1_350_000, version: 4 });
  });

  it('열리지 않은 보너스, 상한인 보너스(Lv1 판매가는 비용 없이 1단계), 모자란 골드, 길드원이 아닌 사람, 제재 계정은 거부한다', async () => {
    const lv1 = await guildWith(0);
    await save(lv1.leader, 1_000_000);
    expect(await donateToBonus(tx(), lv1.leader, lv1.id, 'bag', 500, NOW)).toEqual({ ok: false, error: 'bonus-locked' });
    expect(await donateToBonus(tx(), lv1.leader, lv1.id, 'sell', 500, NOW)).toEqual({ ok: false, error: 'rank-maxed' });
    const g = await guildWith(0);
    await levelUp(g.id, 10_000);
    await save(g.leader, 1_000);
    expect(await donateToBonus(tx(), g.leader, g.id, 'sell', 5_000, NOW)).toEqual({ ok: false, error: 'not-enough-gold' });
    const outsider = await user();
    await save(outsider, 1_000_000);
    expect(await donateToBonus(tx(), outsider, g.id, 'sell', 5_000, NOW)).toEqual({ ok: false, error: 'not-member' });
    const unsaved = await guildWith(0);
    await levelUp(unsaved.id, 10_000);
    expect(await donateToBonus(tx(), unsaved.leader, unsaved.id, 'sell', 5_000, NOW)).toEqual({ ok: false, error: 'not-enough-gold' });
    const banned = await guildWith(0);
    await levelUp(banned.id, 10_000);
    await save(banned.leader, 1_000_000, { restricted: true });
    expect(await donateToBonus(tx(), banned.leader, banned.id, 'sell', 5_000, NOW)).toEqual({ ok: false, error: 'restricted' });
    expect(await saveOf(lv1.leader)).toEqual({ gold: 1_000_000, version: 2 });
    expect(await saveOf(g.leader)).toEqual({ gold: 1_000, version: 2 });
    expect(await saveOf(banned.leader)).toEqual({ gold: 1_000_000, version: 2 });
    expect(await bonusLogs(g.id)).toEqual([]);
  });

  it('기부 전에 상태를 읽은 액션은 확정하지 못한다(낙관 락) — 기부로 뺀 골드를 덮어쓰지 않는다', async () => {
    const g = await guildWith(0);
    await levelUp(g.id, 10_000);
    await save(g.leader, 500_000);
    await donateToBonus(tx(), g.leader, g.id, 'sell', 100_000, NOW);
    const stale = versionUpdate(g.leader, { ...newState(), gold: 500_000 }, 2, NOW);
    expect(await commitAction(database.db, stale, [])).toBe(false);
    expect(await saveOf(g.leader)).toEqual({ gold: 400_000, version: 3 });
  });

  it('조회는 보너스별 단계(열리면 1단계)·상한·모인 골드·다음 비용·효과·내 기부와 전체 기부 순위를 싣는다. 기부는 기여로 세지 않는다', async () => {
    const g = await guildWith(1);
    const [m1] = g.members;
    await levelUp(g.id, 25_000);
    await save(g.leader, 10_000_000);
    await save(m1, 10_000_000);
    await donateToBonus(tx(), g.leader, g.id, 'sell', 100_000, NOW);
    await donateToBonus(tx(), m1, g.id, 'sell', 300_000, NOW);
    await donateToBonus(tx(), m1, g.id, 'named', 50_000, NOW);
    const view = await myGuild(database.db, g.leader, NOW);
    expect(view?.growth).toMatchObject({ level: 3, total: 25_000 });
    expect(view?.effects).toEqual({ sell: 0.04, bag: 0.04, named: 0.05, rare: 0, mutation: 0 });
    const [sell, bag, named, rare] = view!.bonuses;
    expect(sell).toEqual({ id: 'sell', unlock: 1, rank: 2, cap: 3, pool: 250_000, next: 500_000, effect: 0.04,
      nextEffect: 0.06, mine: 100_000 });
    expect(bag).toEqual({ id: 'bag', unlock: 2, rank: 1, cap: 3, pool: 0, next: 150_000, effect: 0.04, nextEffect: 0.08, mine: 0 });
    expect(named).toMatchObject({ id: 'named', rank: 1, pool: 50_000, mine: 0 });
    expect(rare).toEqual({ id: 'rare', unlock: 4, rank: 0, cap: 0, pool: 0, next: null, effect: 0, nextEffect: 0.02, mine: 0 });
    expect(view!.donors.map(d => [d.uid, d.gold])).toEqual([[m1, 350_000], [g.leader, 100_000]]);
    expect(view!.logbook[0]).toMatchObject({ kind: 'donate', detail: 'named', value: 50_000 });
  });

  it('계정 정리는 기부 행의 사람만 비우고 모인 골드와 단계를 지킨다', async () => {
    const g = await guildWith(1);
    const [m1] = g.members;
    await levelUp(g.id, 10_000);
    await save(m1, 1_000_000);
    await donateToBonus(tx(), m1, g.id, 'sell', 400_000, NOW);
    await deleteUserGuild(database.db, m1);
    expect((await client.query('select 1 from public.guild_bonus_donations where user_id = $1', [m1])).rows).toEqual([]);
    const view = (await myGuild(database.db, g.leader, NOW))!;
    expect(view.bonuses[0]).toMatchObject({ rank: 2, pool: 0 });
    expect(view.donors).toEqual([{ uid: null, nick: null, gold: 150_000 }]);
  });
});

describe('길드 이름 바꾸기', () => {
  const save = (uid: string, gold: number, opts: { restricted?: boolean } = {}) => client.query(
    `insert into public.saves_current (user_id, data, gold, fame, boat, rod, version, restricted) values ($1, '{}', $2, 0, 0, 1, 2, $3)`,
    [uid, gold, opts.restricted ?? false]);
  const saveOf = async (uid: string) => {
    const { rows: [r] } = await client.query<{ gold: string; version: number }>(
      'select gold, version from public.saves_current where user_id = $1', [uid]);
    return { gold: Number(r.gold), version: Number(r.version) };
  };
  const nameOf = async (id: string) => (await client.query<{ name: string }>('select name from public.guilds where id = $1', [id])).rows[0].name;
  const renameLogs = async (guildId: string) => (await client.query<{ user_id: string; detail: string }>(
    `select user_id::text, detail from public.guild_logs where guild_id = $1 and kind = 'rename' order by id`, [guildId]))
    .rows.map(r => [r.user_id, r.detail]);
  /** 길드장의 저장 골드를 정해 둔 길드 */
  async function rich(gold = 300_000, name = `r${seq++}`) {
    const g = await guildWith(1);
    await client.query('update public.guilds set name = $2 where id = $1', [g.id, name]);
    await save(g.leader, gold);
    return g;
  }

  it('바꾸면 골드 10만을 빼고 저장 버전을 올리며, 이름과 마지막 변경 시각을 바꾸고 항해일지에 새 이름을 남긴다', async () => {
    const g = await rich();
    expect(await renameGuild(tx(), g.leader, g.id, '새바다', NOW)).toEqual({ ok: true, name: '새바다', gold: 200_000 });
    expect(await saveOf(g.leader)).toEqual({ gold: 200_000, version: 3 });
    expect(await nameOf(g.id)).toBe('새바다');
    expect(await renameLogs(g.id)).toEqual([[g.leader, '새바다']]);
    const view = await myGuild(database.db, g.leader, NOW);
    expect(view).toMatchObject({ name: '새바다', renamedAt: NOW });
    expect(view?.logbook[0]).toMatchObject({ kind: 'rename', uid: g.leader, detail: '새바다' });
  });

  it('길드장이 아닌 길드원, 길드원이 아닌 사람, 없는 길드는 거부하고 아무것도 바꾸지 않는다', async () => {
    const g = await rich();
    const outsider = await user();
    await save(g.members[0], 500_000);
    expect(await renameGuild(tx(), g.members[0], g.id, '새바다', NOW)).toEqual({ ok: false, error: 'not-leader' });
    expect(await renameGuild(tx(), outsider, g.id, '새바다', NOW)).toEqual({ ok: false, error: 'not-member' });
    expect(await renameGuild(tx(), g.leader, randomUUID(), '새바다', NOW)).toEqual({ ok: false, error: 'not-member' });
    expect(await saveOf(g.members[0])).toEqual({ gold: 500_000, version: 2 });
    expect(await saveOf(g.leader)).toEqual({ gold: 300_000, version: 2 });
    expect(await renameLogs(g.id)).toEqual([]);
  });

  it('이름 규칙 위반, 지금 이름과 같은 이름, 다른 길드가 쓰는 이름(대소문자 무시)은 거부한다. 대소문자만 바꾸는 것은 된다', async () => {
    const other = await rich(0, 'Taken');
    const g = await rich(300_000, 'MySea');
    expect(await renameGuild(tx(), g.leader, g.id, '가 나', NOW)).toEqual({ ok: false, error: 'bad-name' });
    expect(await renameGuild(tx(), g.leader, g.id, 'MySea', NOW)).toEqual({ ok: false, error: 'same-name' });
    expect(await renameGuild(tx(), g.leader, g.id, 'taken', NOW)).toEqual({ ok: false, error: 'name-taken' });
    expect(other.id).not.toBe(g.id);
    expect(await saveOf(g.leader)).toEqual({ gold: 300_000, version: 2 });
    expect(await renameGuild(tx(), g.leader, g.id, 'mysea', NOW)).toMatchObject({ ok: true, name: 'mysea' });
  });

  it('같은 게임 날짜(한국 시간 새벽 4시 경계)에는 한 번만 바꾸고, 다음 게임 날짜에는 다시 바꾼다', async () => {
    const g = await rich();
    // 2026-11-05T03:00Z = 11월 5일 12:00 KST. 다음 게임 날짜는 11월 6일 04:00 KST = 11월 5일 19:00Z
    expect(await renameGuild(tx(), g.leader, g.id, '일번', NOW)).toMatchObject({ ok: true });
    expect(await renameGuild(tx(), g.leader, g.id, '이번', '2026-11-05T18:59:00.000Z')).toEqual({ ok: false, error: 'renamed-today' });
    expect(await nameOf(g.id)).toBe('일번');
    expect(await saveOf(g.leader)).toEqual({ gold: 200_000, version: 3 });
    expect(await renameGuild(tx(), g.leader, g.id, '이번', '2026-11-05T19:00:00.000Z')).toEqual({ ok: true, name: '이번', gold: 100_000 });
    expect(await renameLogs(g.id)).toEqual([[g.leader, '일번'], [g.leader, '이번']]);
  });

  it('골드가 정확히 10만이면 바꾸고 0이 되며, 모자라거나 저장이 없거나 제재 계정이면 거부한다', async () => {
    const exact = await rich(100_000);
    expect(await renameGuild(tx(), exact.leader, exact.id, '딱맞게', NOW)).toEqual({ ok: true, name: '딱맞게', gold: 0 });
    const poor = await rich(99_999);
    expect(await renameGuild(tx(), poor.leader, poor.id, '가난', NOW)).toEqual({ ok: false, error: 'not-enough-gold' });
    expect(await saveOf(poor.leader)).toEqual({ gold: 99_999, version: 2 });
    const unsaved = await guildWith(0);
    expect(await renameGuild(tx(), unsaved.leader, unsaved.id, '무저장', NOW)).toEqual({ ok: false, error: 'not-enough-gold' });
    const banned = await guildWith(0);
    await save(banned.leader, 500_000, { restricted: true });
    expect(await renameGuild(tx(), banned.leader, banned.id, '제재', NOW)).toEqual({ ok: false, error: 'restricted' });
    expect(await saveOf(banned.leader)).toEqual({ gold: 500_000, version: 2 });
    expect(await renameLogs(poor.id)).toEqual([]);
  });
});
