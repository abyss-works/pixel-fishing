// 길드(guilds·guild_members·guild_join_requests·guild_contributions·guild_logs·guild_bonuses·guild_bonus_donations) 소유 모듈 —
// 만들기, 가입 방식 설정, 코드로 들어오기와 가입 신청, 신청 처리, 떠나기·내보내기, 길드장 위임, 기여와 항해일지 기록,
// 보너스 기부, 조회, 미리보기, 계정 정리.
// 인원과 역할을 보고 바꾸는 작업은 트랜잭션 안에서 길드 행을 잠가 같은 길드의 변경을 줄 세운다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database, Executor } from '../_db/client.js';
import {
  GUILD_BONUS_MAX_RANK, GUILD_DAILY_FAME_CAP, bonusEffect, bonusRank, bonusRankCost, contributionDayOf, donationOutcome,
  guildBonusLevels,
  GUILD_JOIN_REQUEST_TTL_MS, GUILD_MAX_MEMBERS, guildEffectsOf, guildLevelOf, guildProgress, handoverOutcome, joinOutcome,
  removalOutcome,
} from '../../src/game/rules/guild.js';
import type { GuildActor, GuildBonusId, GuildEffects, GuildJoinMode, GuildLogKind, GuildRole } from '../../src/game/rules/guild.js';
import { at } from './json.js';
import { goldDebit } from './save.js';

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

/**
 * 보너스 하나의 상태 — 해금 레벨, 지금 단계(열렸으면 최소 1)와 상한(길드 레벨, 열리지 않았으면 0), 다음 단계를 향해
 * 모인 골드와 비용, 지금·다음 단계 효과, 내가 이 보너스에 기부한 골드
 */
export interface GuildBonusView {
  id: GuildBonusId;
  unlock: number;
  rank: number;
  cap: number;
  pool: number;
  /** 다음 단계 비용. 5단계이거나 열리지 않았으면 null */
  next: number | null;
  /** 지금 단계의 효과와 다음 단계의 효과(5단계면 null) */
  effect: number;
  nextEffect: number | null;
  mine: number;
}

/** 기부 순위 한 줄 — 보너스를 합친 사람별 전체 기부액. 지운 계정은 uid가 null이다 */
export interface GuildDonor { uid: string | null; nick: string | null; gold: number }

/** 가입 신청 한 줄 — 신청한 사람과 신청 시각 */
export interface GuildJoinRequest { uid: string; nick: string | null; requestedAt: string }

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
  /** 바뀌지 않는 고유 코드. 초대 링크와 코드 입력이 쓴다 */
  code: string;
  joinMode: GuildJoinMode;
  /** 초대 링크와 함께 복사하는 권유 문구. 비었으면 null이고 기본 문구를 쓴다 */
  pitch: string | null;
  /** 살아 있는 가입 신청(먼저 신청한 순). 길드장에게만 싣고, 길드원에게는 빈 목록이다 */
  requests: GuildJoinRequest[];
  /** 성장 — 누적 기여도, 레벨, 지금 레벨의 시작 문턱과 다음 문턱(최대 레벨이면 null) */
  growth: { level: number; total: number; floor: number; next: number | null };
  /** 보너스 다섯(해금 순)과, 그 단계로 서버가 액션에 적용하는 효과, 기부 순위(전체 기부액 많은 순) */
  bonuses: GuildBonusView[];
  effects: GuildEffects;
  donors: GuildDonor[];
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
  const { rows: [g] } = await db.execute<{
    id: string; name: string; created_at: string | Date; role: GuildRole; code: string; join_mode: GuildJoinMode; pitch: string | null;
  }>(sql`
    select g.id::text as id, g.name, g.created_at, m.role, g.code, g.join_mode, g.pitch from public.guild_members m
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
  const { bonuses, effects, donors } = await bonusViews(db, g.id, uid, progress.level);
  const requests = g.role === 'leader' ? await joinRequests(db, g.id, nowISO) : [];
  return { id: g.id, name: g.name, createdAt: iso(g.created_at), role: g.role, members, code: g.code, joinMode: g.join_mode,
    pitch: g.pitch, requests, growth: progress, bonuses, effects, donors, logbook };
}

/** 보너스 다섯의 상태, 효과, 기부 순위 — 기부가 없던 보너스는 저장된 단계 0, 모인 골드 0이다 */
async function bonusViews(db: Executor, guildId: string, uid: string, level: number):
  Promise<{ bonuses: GuildBonusView[]; effects: GuildEffects; donors: GuildDonor[] }> {
  const { rows: ranks } = await db.execute<{ bonus: GuildBonusId; rank: number; pool: number | string }>(sql`
    select bonus, rank, pool from public.guild_bonuses where guild_id = ${guildId}`);
  const { rows: mine } = await db.execute<{ bonus: GuildBonusId; gold: number | string }>(sql`
    select bonus, gold from public.guild_bonus_donations where guild_id = ${guildId} and user_id = ${uid}`);
  const { rows: totals } = await db.execute<{ uid: string | null; nick: string | null; gold: number | string }>(sql`
    select d.user_id::text as uid, p.nickname as nick, sum(d.gold) as gold
    from public.guild_bonus_donations d left join public.profiles p on p.user_id = d.user_id
    where d.guild_id = ${guildId} group by d.user_id, p.nickname order by sum(d.gold) desc, d.user_id`);
  const stored = Object.fromEntries(ranks.map(r => [r.bonus, r.rank])) as Partial<Record<GuildBonusId, number>>;
  const bonuses = guildBonusLevels(level).map(({ id, unlock, cap }) => {
    const rank = bonusRank(id, level, stored[id] ?? 0);
    return { id, unlock, rank, cap, pool: Number(ranks.find(r => r.bonus === id)?.pool ?? 0),
      next: rank > 0 ? bonusRankCost(rank + 1) : null, effect: bonusEffect(id, rank),
      nextEffect: rank < GUILD_BONUS_MAX_RANK ? bonusEffect(id, rank + 1) : null,
      mine: Number(mine.find(m => m.bonus === id)?.gold ?? 0) };
  });
  return { bonuses, effects: guildEffectsOf(level, stored),
    donors: totals.map(t => ({ uid: t.uid, nick: t.nick, gold: Number(t.gold) })) };
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
    const level = guildLevelOf(Number(sum.total));
    const before = bonusRank(bonus, level, cur?.rank ?? 0);
    const r = donationOutcome(bonus, level, { rank: cur?.rank ?? 0, pool: Number(cur?.pool ?? 0) }, gold, amount);
    if (!r.ok) return r;
    await tx.execute(goldDebit(uid, r.accepted));
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

/** 길드의 저장된 보너스별 단계를 { 보너스: 단계 } JSON으로 읽는 하위 쿼리 — 액션 읽기가 효과를 계산할 때 쓴다 */
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

export type CreateOutcome = { ok: true; id: string } | { ok: false; error: 'already-in-guild' | 'name-taken' | 'code-taken' };

/**
 * 길드를 만들고 만든 사람을 길드장으로 넣는다. 이름 형식은 호출자가 먼저 검사하고, 고유 코드는 호출자가 만들어 넘긴다.
 * 코드가 이미 쓰이고 있으면 code-taken이고, 호출자가 새 코드로 다시 시도한다. 가입 방식은 기본값(승인 가입)이다.
 * 다른 길드에 넣어 둔 가입 신청은 지운다.
 */
export async function createGuild(withTransaction: Tx, uid: string, name: string, code: string, nowISO: string): Promise<CreateOutcome> {
  return withTransaction(async tx => {
    if (await guildIdOf(tx, uid)) return { ok: false, error: 'already-in-guild' };
    const { rows: [g] } = await tx.execute<{ id: string }>(sql`insert into public.guilds (name, code, created_at)
      values (${name}, ${code}, ${at(nowISO)}) on conflict do nothing returning id::text as id`);
    if (!g) {
      const { rows: taken } = await tx.execute(sql`select 1 from public.guilds where lower(name) = lower(${name})`);
      return { ok: false, error: taken.length > 0 ? 'name-taken' : 'code-taken' };
    }
    await tx.execute(sql`insert into public.guild_members (guild_id, user_id, role, joined_at)
      values (${g.id}, ${uid}, 'leader', ${at(nowISO)})`);
    await tx.execute(sql`delete from public.guild_join_requests where user_id = ${uid}`);
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

/** 살아 있는 신청을 거르는 조건(신청 시각이 유효 기간 안) */
const requestAlive = (nowISO: string) =>
  sql`r.created_at > ${at(new Date(Date.parse(nowISO) - GUILD_JOIN_REQUEST_TTL_MS).toISOString())}`;

/** 그 길드에 들어온 살아 있는 가입 신청(먼저 신청한 순) */
async function joinRequests(db: Executor, guildId: string, nowISO: string): Promise<GuildJoinRequest[]> {
  const { rows } = await db.execute<{ uid: string; nick: string | null; created_at: string | Date }>(sql`
    select r.user_id::text as uid, p.nickname as nick, r.created_at from public.guild_join_requests r
    left join public.profiles p on p.user_id = r.user_id
    where r.guild_id = ${guildId} and ${requestAlive(nowISO)} order by r.created_at, r.user_id`);
  return rows.map(r => ({ uid: r.uid, nick: r.nick, requestedAt: iso(r.created_at) }));
}

/** 내가 넣어 둔 살아 있는 가입 신청. 없으면 null */
export async function myJoinRequest(db: Executor, uid: string, nowISO: string):
  Promise<{ code: string; name: string; requestedAt: string } | null> {
  const { rows: [r] } = await db.execute<{ code: string; name: string; created_at: string | Date }>(sql`
    select g.code, g.name, r.created_at from public.guild_join_requests r join public.guilds g on g.id = r.guild_id
    where r.user_id = ${uid} and ${requestAlive(nowISO)}`);
  return r ? { code: r.code, name: r.name, requestedAt: iso(r.created_at) } : null;
}

/** 초대 링크 미리보기 — 길드 이름, 레벨, 지금 길드원 수와 상한, 가입 방식. 길드원 이름은 싣지 않는다 */
export interface GuildPreview { code: string; name: string; level: number; members: number; cap: number; joinMode: GuildJoinMode }

/** 고유 코드의 길드 미리보기. 없는 코드면 null */
export async function guildPreview(db: Executor, code: string): Promise<GuildPreview | null> {
  const { rows: [g] } = await db.execute<{
    code: string; name: string; join_mode: GuildJoinMode; members: number | string; total: number | string;
  }>(sql`
    select g.code, g.name, g.join_mode,
      (select count(*) from public.guild_members m where m.guild_id = g.id and m.left_at is null) as members,
      ${guildTotal(sql`g.id`)} as total
    from public.guilds g where g.code = ${code}`);
  if (!g) return null;
  return { code: g.code, name: g.name, level: guildLevelOf(Number(g.total)), members: Number(g.members), cap: GUILD_MAX_MEMBERS,
    joinMode: g.join_mode };
}

export type JoinOutcome =
  | { ok: true; id: string; result: 'joined' }
  | { ok: true; id: string; result: 'requested'; guild: string; leader: string; nick: string | null }
  | { ok: false; error: 'bad-code' | 'already-in-guild' | 'guild-full' | 'guild-closed' };

/**
 * 고유 코드로 들어온다. 가입 방식에 따라 바로 들어가거나(전에 떠났던 길드면 같은 행을 되살린다) 가입 신청을 넣는다.
 * 신청은 한 사람에 하나라 다른 길드에 넣어 둔 신청은 이 신청으로 바뀐다. 들어가면 내 신청은 지운다.
 * 신청이면 알림에 쓸 길드장의 uid, 길드 이름, 신청한 사람의 닉네임을 함께 돌려준다.
 */
export async function joinByCode(withTransaction: Tx, uid: string, code: string, nowISO: string): Promise<JoinOutcome> {
  return withTransaction(async tx => {
    const { rows: [g] } = await tx.execute<{ id: string; name: string; join_mode: GuildJoinMode }>(sql`
      select id::text as id, name, join_mode from public.guilds where code = ${code}`);
    if (!g) return { ok: false, error: 'bad-code' };
    const members = await lockMembers(tx, g.id);
    if (!members) return { ok: false, error: 'bad-code' };
    if (await guildIdOf(tx, uid)) return { ok: false, error: 'already-in-guild' };
    const outcome = joinOutcome(g.join_mode, members.length);
    if (outcome === 'closed') return { ok: false, error: 'guild-closed' };
    if (outcome === 'guild-full') return { ok: false, error: 'guild-full' };
    if (outcome === 'request') {
      await tx.execute(sql`insert into public.guild_join_requests (user_id, guild_id, created_at) values (${uid}, ${g.id}, ${at(nowISO)})
        on conflict (user_id) do update set guild_id = excluded.guild_id, created_at = excluded.created_at`);
      const leader = members.find(m => m.role === 'leader');
      const { rows: [p] } = await tx.execute<{ nickname: string }>(sql`select nickname from public.profiles where user_id = ${uid}`);
      return { ok: true, id: g.id, result: 'requested', guild: g.name, leader: leader?.uid ?? '', nick: p?.nickname ?? null };
    }
    await addMember(tx, g.id, uid, nowISO);
    return { ok: true, id: g.id, result: 'joined' };
  });
}

/** 길드원으로 넣는다(떠났던 행은 되살린다). 그 사람의 가입 신청을 지우고 항해일지에 남긴다 */
async function addMember(tx: Executor, guildId: string, uid: string, nowISO: string): Promise<void> {
  await tx.execute(sql`insert into public.guild_members (guild_id, user_id, role, joined_at)
    values (${guildId}, ${uid}, 'member', ${at(nowISO)})
    on conflict (guild_id, user_id) do update set role = 'member', joined_at = excluded.joined_at, left_at = null`);
  await tx.execute(sql`delete from public.guild_join_requests where user_id = ${uid}`);
  await tx.execute(logInsert(guildId, uid, 'join', nowISO));
}

export type DecideOutcome =
  | { ok: true; guild: string }
  | { ok: false; error: 'not-member' | 'not-leader' | 'no-request' | 'already-in-guild' | 'guild-full' };

/**
 * 가입 신청을 승인하거나 거절한다(길드장). 승인하면 길드원으로 넣고, 거절하면 신청만 지운다.
 * 신청한 사람이 그 사이 다른 길드에 들어갔으면 신청을 지우고 already-in-guild다. 인원이 가득 차면 신청을 남긴다.
 */
export async function decideJoinRequest(withTransaction: Tx, uid: string, guildId: string, target: string, approve: boolean,
  nowISO: string): Promise<DecideOutcome> {
  return withTransaction(async tx => {
    const members = await lockMembers(tx, guildId);
    const me = members?.find(m => m.uid === uid);
    if (!members || !me) return { ok: false, error: 'not-member' };
    if (me.role !== 'leader') return { ok: false, error: 'not-leader' };
    const { rows: [req] } = await tx.execute(sql`select 1 from public.guild_join_requests r
      where r.user_id = ${target} and r.guild_id = ${guildId} and ${requestAlive(nowISO)}`);
    if (!req) return { ok: false, error: 'no-request' };
    const { rows: [g] } = await tx.execute<{ name: string }>(sql`select name from public.guilds where id = ${guildId}`);
    if (!approve) {
      await tx.execute(sql`delete from public.guild_join_requests where user_id = ${target}`);
      return { ok: true, guild: g.name };
    }
    if (await guildIdOf(tx, target)) {
      await tx.execute(sql`delete from public.guild_join_requests where user_id = ${target}`);
      return { ok: false, error: 'already-in-guild' };
    }
    if (members.length >= GUILD_MAX_MEMBERS) return { ok: false, error: 'guild-full' };
    await addMember(tx, guildId, target, nowISO);
    return { ok: true, guild: g.name };
  });
}

/** 내가 넣어 둔 가입 신청을 거둔다. 없으면 아무것도 하지 않는다 */
export async function cancelJoinRequest(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.guild_join_requests where user_id = ${uid}`);
}

export type SettingsOutcome =
  | { ok: true; joinMode: GuildJoinMode; pitch: string | null }
  | { ok: false; error: 'not-member' | 'not-leader' };

/** 가입 방식과 권유 문구를 바꾼다(길드장). 넘기지 않은 값은 그대로 둔다. 닫아도 이미 들어온 신청은 남는다 */
export async function setJoinSettings(db: Executor, uid: string, guildId: string,
  change: { joinMode?: GuildJoinMode; pitch?: string | null }): Promise<SettingsOutcome> {
  const { rows: [me] } = await db.execute<{ role: GuildRole }>(sql`select role from public.guild_members
    where guild_id = ${guildId} and user_id = ${uid} and left_at is null`);
  if (!me) return { ok: false, error: 'not-member' };
  if (me.role !== 'leader') return { ok: false, error: 'not-leader' };
  const mode = change.joinMode === undefined ? sql`join_mode` : sql`${change.joinMode}`;
  const pitch = change.pitch === undefined ? sql`pitch` : sql`${change.pitch}`;
  const { rows: [g] } = await db.execute<{ join_mode: GuildJoinMode; pitch: string | null }>(sql`update public.guilds
    set join_mode = ${mode}, pitch = ${pitch} where id = ${guildId} returning join_mode, pitch`);
  return { ok: true, joinMode: g.join_mode, pitch: g.pitch };
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
 * 계정 정리에서 그 사용자의 가입 신청, 길드원 행과 항해일지 줄을 모두 지운다(떠난 길드의 기록 포함).
 * 기여 행과 기부 행은 사람 열만 비우고 남긴다 — 길드의 누적 기여도와 레벨, 보너스 기부 기록이 줄지 않는다.
 * 길드장이면 가장 먼저 들어온 길드원에게 길드장을 넘기고, 혼자면 길드를 없앤다.
 */
export async function deleteUserGuild(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.guild_join_requests where user_id = ${uid}`);
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
