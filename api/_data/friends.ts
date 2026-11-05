// 친구(friends) 소유 모듈 — 요청·수락·삭제와 목록 조회. 두 사람 사이 관계는 행 하나다(방향 무관).
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';

/** 닉네임(대소문자 무시)으로 계정(게스트 제외)을 찾는다 */
export async function accountByNickname(db: Executor, nickname: string): Promise<string | null> {
  const { rows } = await db.execute<{ id: string }>(sql`select p.user_id::text as id from public.profiles p
    join auth.users u on u.id = p.user_id
    where lower(p.nickname) = lower(${nickname}) and not u.is_anonymous limit 1`);
  return rows[0]?.id ?? null;
}

/** 계정(게스트 아님)인가 */
export async function isAccount(db: Executor, uid: string): Promise<boolean> {
  const { rows } = await db.execute<{ ok: boolean }>(sql`select exists (select 1 from auth.users
    where id = ${uid} and not is_anonymous) as ok`);
  return rows[0].ok;
}

export type RequestOutcome = 'requested' | 'accepted' | 'already';

/**
 * 친구 요청. 상대가 이미 나에게 요청했으면 바로 친구가 된다. 이미 친구이거나 내가 요청 중이면 그대로 둔다.
 * 차단 여부는 호출자가 먼저 거른다.
 */
export async function requestFriend(db: Executor, me: string, target: string, nowISO: string): Promise<RequestOutcome> {
  const { rows } = await db.execute<{ requester: string; accepted: boolean }>(sql`select requester_id::text as requester,
      accepted_at is not null as accepted from public.friends
    where (requester_id = ${me} and addressee_id = ${target}) or (requester_id = ${target} and addressee_id = ${me})`);
  const row = rows[0];
  if (row?.accepted || row?.requester === me) return 'already';
  if (row) {
    await acceptFriend(db, me, target, nowISO);
    return 'accepted';
  }
  await db.execute(sql`insert into public.friends (requester_id, addressee_id, created_at)
    values (${me}, ${target}, ${nowISO}::timestamptz) on conflict do nothing`);
  return 'requested';
}

/** 받은 요청을 수락한다. 그런 요청이 없으면 false */
export async function acceptFriend(db: Executor, me: string, from: string, nowISO: string): Promise<boolean> {
  const { rows } = await db.execute(sql`update public.friends set accepted_at = ${nowISO}::timestamptz
    where requester_id = ${from} and addressee_id = ${me} and accepted_at is null returning 1`);
  return rows.length > 0;
}

/** 두 사람 사이의 관계(친구, 보낸 요청, 받은 요청)를 지운다 — 거절·취소·친구 끊기가 모두 이것이다 */
export async function removeFriend(db: Executor, me: string, other: string): Promise<void> {
  await db.execute(sql`delete from public.friends
    where (requester_id = ${me} and addressee_id = ${other}) or (requester_id = ${other} and addressee_id = ${me})`);
}

export interface FriendRow {
  uid: string;
  nick: string | null;
  state: 'friend' | 'incoming' | 'outgoing';
  /** 마지막 행동 시각(저장 상태 갱신 시각). 저장 상태가 없으면 null */
  lastActiveAt: string | null;
}

/** 내 친구와 받은 요청·보낸 요청. 이름 순 */
export async function listFriends(db: Executor, me: string): Promise<FriendRow[]> {
  const { rows } = await db.execute<{ uid: string; nick: string | null; state: FriendRow['state']; last: string | Date | null }>(sql`
    select o.id::text as uid, p.nickname as nick, o.state, c.updated_at as last
    from (
      select case when f.requester_id = ${me} then f.addressee_id else f.requester_id end as id,
             case when f.accepted_at is not null then 'friend'
                  when f.requester_id = ${me} then 'outgoing' else 'incoming' end as state
      from public.friends f
      where f.requester_id = ${me} or f.addressee_id = ${me}
    ) o
    left join public.profiles p on p.user_id = o.id
    left join public.saves_current c on c.user_id = o.id
    order by p.nickname nulls last, o.id`);
  return rows.map(r => ({ uid: r.uid, nick: r.nick, state: r.state,
    lastActiveAt: r.last ? new Date(r.last).toISOString() : null }));
}

/** 계정 정리에서 그 사용자의 친구 관계와 요청을 모두 지운다 */
export async function deleteUserFriends(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.friends where requester_id = ${uid} or addressee_id = ${uid}`);
}

/**
 * 친구 요청 닉네임 자동완성 — 앞부분이 같은(대소문자 무시) 계정 유저를 이름 순으로 limit명.
 * 나, 게스트, 이미 친구이거나 요청 중인 사람, 어느 쪽이든 차단한 사이는 뺀다. %와 _는 글자 그대로 찾는다.
 */
export async function searchAccounts(db: Executor, me: string, prefix: string, limit: number): Promise<{ uid: string; nickname: string }[]> {
  const pattern = prefix.toLowerCase().replace(/[\\%_]/g, c => `\\${c}`) + '%';
  const { rows } = await db.execute<{ uid: string; nickname: string }>(sql`select p.user_id::text as uid, p.nickname
    from public.profiles p
    join auth.users u on u.id = p.user_id
    where not u.is_anonymous and p.user_id <> ${me} and lower(p.nickname) like ${pattern} escape '\\'
      and not exists (select 1 from public.friends f
        where (f.requester_id = ${me} and f.addressee_id = p.user_id) or (f.requester_id = p.user_id and f.addressee_id = ${me}))
      and not exists (select 1 from public.blocks b
        where (b.user_id = ${me} and b.blocked_id = p.user_id) or (b.user_id = p.user_id and b.blocked_id = ${me}))
    order by lower(p.nickname)
    limit ${limit}`);
  return rows;
}
