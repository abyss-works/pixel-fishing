// 길드(guilds·guild_members·guild_invites) 소유 모듈 — 만들기, 초대 코드, 가입, 떠나기·내보내기, 길드장 위임, 조회, 계정 정리.
// 인원과 역할을 보고 바꾸는 작업은 트랜잭션 안에서 길드 행을 잠가 같은 길드의 변경을 줄 세운다.
import { sql } from 'drizzle-orm';
import type { Database, Executor } from '../_db/client.js';
import { guildFull, handoverOutcome, inviteExpiresAt, removalOutcome } from '../../src/game/rules/guild.js';
import type { GuildActor, GuildRole } from '../../src/game/rules/guild.js';
import { at } from './json.js';

type Tx = Database['withTransaction'];

export interface GuildMember {
  uid: string;
  nick: string | null;
  role: GuildRole;
  joinedAt: string;
  /** 떠난 시각. 지금 길드원이면 null */
  leftAt: string | null;
}

export interface GuildView {
  id: string;
  name: string;
  createdAt: string;
  /** 내 역할 */
  role: GuildRole;
  /** 지금 길드원(길드장 먼저, 들어온 순)과 떠난 선원(최근에 떠난 순) */
  members: GuildMember[];
  /** 쓸 수 있는 초대 코드. 길드장에게만 싣고, 없거나 만료됐으면 null */
  invite: { code: string; expiresAt: string } | null;
}

const iso = (v: string | Date) => new Date(v).toISOString();

/** 지금 속한 길드의 id. 없으면 null */
export async function guildIdOf(db: Executor, uid: string): Promise<string | null> {
  const { rows } = await db.execute<{ id: string }>(sql`select guild_id::text as id from public.guild_members
    where user_id = ${uid} and left_at is null`);
  return rows[0]?.id ?? null;
}

/** 내 길드와 길드원. 길드가 없으면 null */
export async function myGuild(db: Executor, uid: string, nowISO: string): Promise<GuildView | null> {
  const { rows: [g] } = await db.execute<{ id: string; name: string; created_at: string | Date; role: GuildRole }>(sql`
    select g.id::text as id, g.name, g.created_at, m.role from public.guild_members m
    join public.guilds g on g.id = m.guild_id
    where m.user_id = ${uid} and m.left_at is null`);
  if (!g) return null;
  const { rows } = await db.execute<{ uid: string; nick: string | null; role: GuildRole; joined_at: string | Date; left_at: string | Date | null }>(sql`
    select m.user_id::text as uid, p.nickname as nick, m.role, m.joined_at, m.left_at
    from public.guild_members m left join public.profiles p on p.user_id = m.user_id
    where m.guild_id = ${g.id}
    order by m.left_at is not null, m.role = 'leader' desc, m.left_at desc, m.joined_at, m.user_id`);
  const members = rows.map(r => ({ uid: r.uid, nick: r.nick, role: r.role, joinedAt: iso(r.joined_at),
    leftAt: r.left_at ? iso(r.left_at) : null }));
  let invite: GuildView['invite'] = null;
  if (g.role === 'leader') {
    const { rows: [i] } = await db.execute<{ code: string; expires_at: string | Date }>(sql`select code, expires_at
      from public.guild_invites where guild_id = ${g.id} and expires_at > ${at(nowISO)}`);
    if (i) invite = { code: i.code, expiresAt: iso(i.expires_at) };
  }
  return { id: g.id, name: g.name, createdAt: iso(g.created_at), role: g.role, members, invite };
}

export type CreateOutcome = { ok: true; id: string } | { ok: false; error: 'already-in-guild' | 'name-taken' };

/** 길드를 만들고 만든 사람을 길드장으로 넣는다. 이름 형식은 호출자가 먼저 검사한다 */
export async function createGuild(withTransaction: Tx, uid: string, name: string, nowISO: string): Promise<CreateOutcome> {
  return withTransaction(async tx => {
    if (await guildIdOf(tx, uid)) return { ok: false, error: 'already-in-guild' };
    const { rows: [g] } = await tx.execute<{ id: string }>(sql`insert into public.guilds (name, created_at)
      values (${name}, ${at(nowISO)}) on conflict do nothing returning id::text as id`);
    if (!g) return { ok: false, error: 'name-taken' };
    await tx.execute(sql`insert into public.guild_members (guild_id, user_id, role, joined_at)
      values (${g.id}, ${uid}, 'leader', ${at(nowISO)})`);
    return { ok: true, id: g.id };
  });
}

/** 길드 행을 잠그고 그 길드의 지금 길드원을 읽는다. 길드가 없으면 null */
async function lockMembers(tx: Executor, guildId: string): Promise<GuildActor[] | null> {
  const { rows: lock } = await tx.execute(sql`select 1 from public.guilds where id = ${guildId} for update`);
  if (lock.length === 0) return null;
  const { rows } = await tx.execute<{ uid: string; role: GuildRole }>(sql`select user_id::text as uid, role
    from public.guild_members where guild_id = ${guildId} and left_at is null`);
  return rows;
}

export type InviteOutcome = { ok: true; code: string; expiresAt: string } | { ok: false; error: 'not-member' | 'not-leader' };

/** 초대 코드를 새로 발급한다. 이전 코드는 사라진다. 길드장만 할 수 있다 */
export async function issueInvite(db: Executor, uid: string, guildId: string, code: string, nowISO: string): Promise<InviteOutcome> {
  const { rows: [me] } = await db.execute<{ role: GuildRole }>(sql`select role from public.guild_members
    where guild_id = ${guildId} and user_id = ${uid} and left_at is null`);
  if (!me) return { ok: false, error: 'not-member' };
  if (me.role !== 'leader') return { ok: false, error: 'not-leader' };
  const expiresAt = inviteExpiresAt(nowISO);
  await db.execute(sql`insert into public.guild_invites (guild_id, code, expires_at) values (${guildId}, ${code}, ${at(expiresAt)})
    on conflict (guild_id) do update set code = excluded.code, expires_at = excluded.expires_at`);
  return { ok: true, code, expiresAt };
}

export type JoinOutcome = { ok: true; id: string } | { ok: false; error: 'bad-code' | 'already-in-guild' | 'guild-full' };

/** 초대 코드로 길드에 들어간다. 전에 떠났던 길드면 같은 행을 되살린다 */
export async function joinGuild(withTransaction: Tx, uid: string, code: string, nowISO: string): Promise<JoinOutcome> {
  return withTransaction(async tx => {
    const { rows: [inv] } = await tx.execute<{ id: string }>(sql`select guild_id::text as id from public.guild_invites
      where code = ${code} and expires_at > ${at(nowISO)}`);
    if (!inv) return { ok: false, error: 'bad-code' };
    const members = await lockMembers(tx, inv.id);
    if (!members) return { ok: false, error: 'bad-code' };
    if (await guildIdOf(tx, uid)) return { ok: false, error: 'already-in-guild' };
    if (guildFull(members.length)) return { ok: false, error: 'guild-full' };
    await tx.execute(sql`insert into public.guild_members (guild_id, user_id, role, joined_at)
      values (${inv.id}, ${uid}, 'member', ${at(nowISO)})
      on conflict (guild_id, user_id) do update set role = 'member', joined_at = excluded.joined_at, left_at = null`);
    return { ok: true, id: inv.id };
  });
}

export type RemoveOutcome =
  | { ok: true; result: 'left' | 'dissolved' | 'kicked' }
  | { ok: false; error: 'not-member' | 'not-leader' | 'handover-first' };

/** 떠나기(자기 자신)와 내보내기(다른 길드원). 떠난 선원의 행은 남긴다. 길드장이 혼자 떠나면 길드를 없앤다 */
export async function removeMember(withTransaction: Tx, uid: string, guildId: string, target: string, nowISO: string): Promise<RemoveOutcome> {
  return withTransaction(async tx => {
    const members = await lockMembers(tx, guildId);
    const me = members?.find(m => m.uid === uid);
    const them = members?.find(m => m.uid === target);
    if (!members || !me || !them) return { ok: false, error: 'not-member' };
    const outcome = removalOutcome(me, them, members.length);
    if (outcome === 'not-leader' || outcome === 'handover-first') return { ok: false, error: outcome };
    if (outcome === 'dissolve') {
      await tx.execute(sql`delete from public.guilds where id = ${guildId}`);
      return { ok: true, result: 'dissolved' };
    }
    await tx.execute(sql`update public.guild_members set left_at = ${at(nowISO)}
      where guild_id = ${guildId} and user_id = ${target}`);
    return { ok: true, result: outcome === 'leave' ? 'left' : 'kicked' };
  });
}

export type HandoverOutcome = { ok: true } | { ok: false; error: 'not-member' | 'not-leader' | 'self' };

/** 길드장을 다른 길드원에게 넘긴다. 나는 일반 길드원이 된다 */
export async function handOver(withTransaction: Tx, uid: string, guildId: string, target: string): Promise<HandoverOutcome> {
  return withTransaction(async tx => {
    const members = await lockMembers(tx, guildId);
    const me = members?.find(m => m.uid === uid);
    if (!members || !me) return { ok: false, error: 'not-member' };
    const outcome = handoverOutcome(me, target);
    if (outcome !== 'ok') return { ok: false, error: outcome };
    if (!members.some(m => m.uid === target)) return { ok: false, error: 'not-member' };
    // 길드장은 길드마다 하나라 먼저 내려놓고 넘긴다
    await tx.execute(sql`update public.guild_members set role = 'member' where guild_id = ${guildId} and user_id = ${uid}`);
    await tx.execute(sql`update public.guild_members set role = 'leader' where guild_id = ${guildId} and user_id = ${target}`);
    return { ok: true };
  });
}

/**
 * 계정 정리에서 그 사용자의 길드원 행을 모두 지운다(떠난 길드의 기록 포함).
 * 길드장이면 가장 먼저 들어온 길드원에게 길드장을 넘기고, 혼자면 길드를 없앤다.
 */
export async function deleteUserGuild(db: Executor, uid: string): Promise<void> {
  const { rows: [led] } = await db.execute<{ id: string }>(sql`select guild_id::text as id from public.guild_members
    where user_id = ${uid} and role = 'leader'`);
  await db.execute(sql`delete from public.guild_members where user_id = ${uid}`);
  if (!led) return;
  const { rows: [next] } = await db.execute<{ uid: string }>(sql`select user_id::text as uid from public.guild_members
    where guild_id = ${led.id} and left_at is null order by joined_at, user_id limit 1`);
  if (next) {
    await db.execute(sql`update public.guild_members set role = 'leader' where guild_id = ${led.id} and user_id = ${next.uid}`);
  } else {
    await db.execute(sql`delete from public.guilds where id = ${led.id}`);
  }
}
