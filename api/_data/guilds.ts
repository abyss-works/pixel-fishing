// 길드(guilds·guild_members·guild_invites·guild_contributions·guild_logs·guild_bonuses·guild_bonus_donations) 소유 모듈 —
// 만들기, 초대 코드, 가입, 떠나기·내보내기, 길드장 위임, 기여와 항해일지 기록, 보너스 기부, 조회, 계정 정리.
// 인원과 역할을 보고 바꾸는 작업은 트랜잭션 안에서 길드 행을 잠가 같은 길드의 변경을 줄 세운다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database, Executor } from '../_db/client.js';
import {
  GUILD_DAILY_FAME_CAP, bonusEffect, bonusRankCost, contributionDayOf, donationOutcome, guildBonusLevels,
  guildEffectsOf, guildFull, guildLevelOf, guildProgress, handoverOutcome, inviteExpiresAt, removalOutcome,
} from '../../src/game/rules/guild.js';
import type { GuildActor, GuildBonusId, GuildEffects, GuildLogKind, GuildRole } from '../../src/game/rules/guild.js';
import { at } from './json.js';

type Tx = Database['withTransaction'];

export interface GuildMember {
  uid: string;
  nick: string | null;
  role: GuildRole;
  joinedAt: string;
  /** 떠난 시각. 지금 길드원이면 null */
  leftAt: string | null;
  /** 이 길드에 쌓은 기여 — 누적과 오늘(게임 날짜) */
  contribution: { total: number; today: number };
}

/**
 * 항해일지 한 줄. detail은 전설 획득이면 어종 id, 네임드 토벌이면 의뢰 id, 기부·단계 상승이면 보너스 id다.
 * value는 기부면 골드, 단계 상승이면 새 단계이고 그 밖에는 null이다
 */
export interface GuildLog {
  id: number;
  kind: GuildLogKind;
  uid: string;
  nick: string | null;
  detail: string | null;
  value: number | null;
  at: string;
}

/** 보너스 하나의 상태 — 해금 레벨, 단계와 상한(길드 레벨, 열리지 않았으면 0), 모인 골드, 다음 단계 비용과 효과, 기부 */
export interface GuildBonusView {
  id: GuildBonusId;
  unlock: number;
  rank: number;
  cap: number;
  pool: number;
  /** 다음 단계 비용. 5단계면 null */
  next: number | null;
  /** 지금 단계의 효과와 다음 단계의 효과(5단계면 null) */
  effect: number;
  nextEffect: number | null;
  /** 내가 이 보너스에 기부한 골드 */
  mine: number;
  /** 기부한 사람(많은 순). 지운 계정은 uid가 null이다 */
  donors: { uid: string | null; nick: string | null; gold: number }[];
}

/** 조회에 싣는 항해일지 줄 수(최근 순) */
const LOGBOOK_LIMIT = 50;

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
  /** 성장 — 누적 기여도, 레벨, 지금 레벨의 시작 문턱과 다음 문턱(최대 레벨이면 null) */
  growth: { level: number; total: number; floor: number; next: number | null };
  /** 보너스 다섯(해금 순)과, 그 단계로 서버가 액션에 적용하는 효과 */
  bonuses: GuildBonusView[];
  effects: GuildEffects;
  /** 항해일지 — 최근 순 */
  logbook: GuildLog[];
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
  const today = contributionDayOf(nowISO);
  const { rows } = await db.execute<{
    uid: string; nick: string | null; role: GuildRole; joined_at: string | Date; left_at: string | Date | null;
    total: number | string; today: number | string;
  }>(sql`
    select m.user_id::text as uid, p.nickname as nick, m.role, m.joined_at, m.left_at,
      coalesce(sum(c.fame + c.clears), 0) as total,
      coalesce(sum(c.fame + c.clears) filter (where c.day = ${today}::date), 0) as today
    from public.guild_members m left join public.profiles p on p.user_id = m.user_id
    left join public.guild_contributions c on c.guild_id = m.guild_id and c.user_id = m.user_id
    where m.guild_id = ${g.id}
    group by m.user_id, p.nickname, m.role, m.joined_at, m.left_at
    order by m.left_at is not null, m.role = 'leader' desc, m.left_at desc, m.joined_at, m.user_id`);
  const members = rows.map(r => ({ uid: r.uid, nick: r.nick, role: r.role, joinedAt: iso(r.joined_at),
    leftAt: r.left_at ? iso(r.left_at) : null, contribution: { total: Number(r.total), today: Number(r.today) } }));
  const { rows: [sum] } = await db.execute<{ total: number | string }>(sql`select ${guildTotal(sql`${g.id}::uuid`)} as total`);
  const progress = guildProgress(Number(sum.total));
  const { rows: logs } = await db.execute<{
    id: number | string; kind: GuildLogKind; uid: string; nick: string | null; detail: string | null;
    value: number | string | null; created_at: string | Date;
  }>(sql`
    select l.id, l.kind, l.user_id::text as uid, p.nickname as nick, l.detail, l.value, l.created_at
    from public.guild_logs l left join public.profiles p on p.user_id = l.user_id
    where l.guild_id = ${g.id} order by l.id desc limit ${LOGBOOK_LIMIT}`);
  const logbook = logs.map(l => ({ id: Number(l.id), kind: l.kind, uid: l.uid, nick: l.nick, detail: l.detail,
    value: l.value === null ? null : Number(l.value), at: iso(l.created_at) }));
  const bonuses = await bonusViews(db, g.id, uid, progress.level);
  let invite: GuildView['invite'] = null;
  if (g.role === 'leader') {
    const { rows: [i] } = await db.execute<{ code: string; expires_at: string | Date }>(sql`select code, expires_at
      from public.guild_invites where guild_id = ${g.id} and expires_at > ${at(nowISO)}`);
    if (i) invite = { code: i.code, expiresAt: iso(i.expires_at) };
  }
  return { id: g.id, name: g.name, createdAt: iso(g.created_at), role: g.role, members, invite,
    growth: progress, bonuses, effects: guildEffectsOf(Object.fromEntries(bonuses.map(b => [b.id, b.rank]))), logbook };
}

/** 보너스 다섯의 상태와 기부 — 기부가 없던 보너스는 0단계, 모인 골드 0이다 */
async function bonusViews(db: Executor, guildId: string, uid: string, level: number): Promise<GuildBonusView[]> {
  const { rows: ranks } = await db.execute<{ bonus: GuildBonusId; rank: number; pool: number | string }>(sql`
    select bonus, rank, pool from public.guild_bonuses where guild_id = ${guildId}`);
  const { rows: gifts } = await db.execute<{ bonus: GuildBonusId; uid: string | null; nick: string | null; gold: number | string }>(sql`
    select d.bonus, d.user_id::text as uid, p.nickname as nick, d.gold
    from public.guild_bonus_donations d left join public.profiles p on p.user_id = d.user_id
    where d.guild_id = ${guildId} order by d.gold desc, d.id`);
  return guildBonusLevels(level).map(({ id, unlock, cap }) => {
    const row = ranks.find(r => r.bonus === id);
    const rank = row?.rank ?? 0;
    const donors = gifts.filter(d => d.bonus === id).map(d => ({ uid: d.uid, nick: d.nick, gold: Number(d.gold) }));
    const next = bonusRankCost(rank + 1);
    return { id, unlock, rank, cap, pool: Number(row?.pool ?? 0), next, effect: bonusEffect(id, rank),
      nextEffect: next === null ? null : bonusEffect(id, rank + 1), mine: donors.find(d => d.uid === uid)?.gold ?? 0, donors };
  });
}

export type DonateOutcome =
  | { ok: true; rank: number; pool: number; accepted: number; gold: number }
  | { ok: false; error: 'not-member' | 'restricted' | 'bonus-locked' | 'rank-maxed' | 'not-enough-gold' };

/**
 * 보너스 기부 — 기부한 사람의 저장 골드를 빼고, 그 보너스의 단계와 모인 골드, 기부 합계, 항해일지를 한 트랜잭션에 쓴다.
 * 길드 행을 잠가 같은 길드의 기부를 줄 세우고, 저장 행을 잠근 뒤 골드를 확인한다. 저장 버전을 올리므로
 * 기부 전에 상태를 읽은 액션은 낙관 락에서 거부되고(409) 최신 상태로 다시 시도한다 — 기부로 뺀 골드를 덮어쓰지 않는다.
 * 저장 행이 없으면 가진 골드가 0이다. 기부는 기여로 세지 않는다.
 */
export async function donateToBonus(withTransaction: Tx, uid: string, guildId: string, bonus: GuildBonusId,
  amount: number, nowISO: string): Promise<DonateOutcome> {
  return withTransaction(async tx => {
    const members = await lockMembers(tx, guildId);
    if (!members?.some(m => m.uid === uid)) return { ok: false, error: 'not-member' };
    const { rows: [sum] } = await tx.execute<{ total: number | string }>(sql`select ${guildTotal(sql`${guildId}::uuid`)} as total`);
    const { rows: [cur] } = await tx.execute<{ rank: number; pool: number | string }>(sql`select rank, pool
      from public.guild_bonuses where guild_id = ${guildId} and bonus = ${bonus}`);
    const { rows: [save] } = await tx.execute<{ gold: number | string; restricted: boolean | null }>(sql`select gold, restricted
      from public.saves_current where user_id = ${uid} for update`);
    if (save?.restricted) return { ok: false, error: 'restricted' };
    const gold = Number(save?.gold ?? 0);
    const before = cur?.rank ?? 0;
    const r = donationOutcome(bonus, guildLevelOf(Number(sum.total)), { rank: before, pool: Number(cur?.pool ?? 0) }, gold, amount);
    if (!r.ok) return r;
    await tx.execute(sql`update public.saves_current set gold = gold - ${r.accepted}, version = version + 1
      where user_id = ${uid}`);
    await tx.execute(sql`insert into public.guild_bonuses (guild_id, bonus, rank, pool) values (${guildId}, ${bonus}, ${r.rank}, ${r.pool})
      on conflict (guild_id, bonus) do update set rank = excluded.rank, pool = excluded.pool`);
    await tx.execute(sql`insert into public.guild_bonus_donations (guild_id, user_id, bonus, gold)
      values (${guildId}, ${uid}, ${bonus}, ${r.accepted})
      on conflict (guild_id, user_id, bonus) do update set gold = public.guild_bonus_donations.gold + excluded.gold`);
    await tx.execute(sql`insert into public.guild_logs (guild_id, user_id, kind, detail, value, created_at)
      values (${guildId}, ${uid}, 'donate', ${bonus}, ${r.accepted}, ${at(nowISO)})`);
    if (r.rank > before) {
      await tx.execute(sql`insert into public.guild_logs (guild_id, user_id, kind, detail, value, created_at)
        values (${guildId}, ${uid}, 'bonus-up', ${bonus}, ${r.rank}, ${at(nowISO)})`);
    }
    return { ok: true, rank: r.rank, pool: r.pool, accepted: r.accepted, gold: gold - r.accepted };
  });
}

/** 길드의 보너스별 단계를 { 보너스: 단계 } JSON으로 읽는 하위 쿼리 — 액션 읽기가 효과를 계산할 때 쓴다 */
export const guildRanksJson = (guildId: SQL) =>
  sql`(select coalesce(json_object_agg(b.bonus, b.rank), '{}') from public.guild_bonuses b where b.guild_id = ${guildId})`;

/**
 * 길드의 누적 기여도 — 그 길드의 하루 기여 행(떠난 선원·지운 계정 포함)의 합.
 * ponytail: 읽을 때마다 합한다. 길드당 행은 길드원 수 × 날짜 수라 작다. 느려지면 길드 행에 합계 열을 두고 기여와 함께 갱신한다.
 */
export const guildTotal = (guildId: SQL) =>
  sql`(select coalesce(sum(c.fame + c.clears), 0)::bigint from public.guild_contributions c where c.guild_id = ${guildId})`;

/** 항해일지 한 줄을 쓰는 문장 */
const logInsert = (guildId: string, uid: string, kind: GuildLogKind, nowISO: string) =>
  sql`insert into public.guild_logs (guild_id, user_id, kind, created_at) values (${guildId}, ${uid}, ${kind}, ${at(nowISO)})`;

/**
 * 액션 하나가 쌓은 기여를 그날(게임 날짜) 그 길드원의 행에 더하는 후속 쓰기. 쌓을 것이 없으면 null.
 * 명성 기여는 그날 이미 쌓은 것과 합쳐 하루 상한(GUILD_DAILY_FAME_CAP)에서 멈춘다. 한 행의 갱신이라 동시에 써도 상한을 넘지 않는다.
 * 그 사이 길드가 없어졌으면 쓰지 않는다.
 */
export function contributionUpsert(guildId: string, uid: string, nowISO: string,
  add: { fame: number; clears: number }): SQL | null {
  if (add.fame <= 0 && add.clears <= 0) return null;
  return sql`insert into public.guild_contributions (guild_id, user_id, day, fame, clears)
    select g.id, ${uid}::uuid, ${contributionDayOf(nowISO)}::date, ${add.fame}::int, ${add.clears}::int
    from public.guilds g where g.id = ${guildId}
    on conflict (guild_id, user_id, day) do update set
      fame = least(${GUILD_DAILY_FAME_CAP}::int, public.guild_contributions.fame + excluded.fame),
      clears = public.guild_contributions.clears + excluded.clears`;
}

/** 액션이 남긴 항해일지 줄(전설 획득·네임드 토벌)을 쓰는 후속 쓰기. 없으면 null. 그 사이 길드가 없어졌으면 쓰지 않는다 */
export function logbookInsert(guildId: string, uid: string, entries: readonly { kind: GuildLogKind; detail: string }[],
  nowISO: string): SQL | null {
  if (entries.length === 0) return null;
  const values = sql.join(entries.map(e => sql`(${e.kind}::text, ${e.detail}::text)`), sql`, `);
  return sql`insert into public.guild_logs (guild_id, user_id, kind, detail, created_at)
    select g.id, ${uid}::uuid, v.kind, v.detail, ${at(nowISO)} from public.guilds g, (values ${values}) as v(kind, detail)
    where g.id = ${guildId}`;
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
    await tx.execute(logInsert(g.id, uid, 'join', nowISO));
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
    await tx.execute(logInsert(inv.id, uid, 'join', nowISO));
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
    await tx.execute(logInsert(guildId, target, outcome === 'leave' ? 'leave' : 'kick', nowISO));
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
 * 계정 정리에서 그 사용자의 길드원 행과 항해일지 줄을 모두 지운다(떠난 길드의 기록 포함).
 * 기여 행과 기부 행은 사람 열만 비우고 남긴다 — 길드의 누적 기여도와 레벨, 보너스 기부 기록이 줄지 않는다.
 * 길드장이면 가장 먼저 들어온 길드원에게 길드장을 넘기고, 혼자면 길드를 없앤다.
 */
export async function deleteUserGuild(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.guild_logs where user_id = ${uid}`);
  await db.execute(sql`update public.guild_contributions set user_id = null where user_id = ${uid}`);
  await db.execute(sql`update public.guild_bonus_donations set user_id = null where user_id = ${uid}`);
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
