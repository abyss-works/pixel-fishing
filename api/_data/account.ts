// 인증 스키마(auth) 쓰기 소유 모듈. 미접속 익명 계정의 대상 선정과 계정 단위 삭제, 관리자가 발급하는 비밀번호 재설정 토큰을 맡는다.
// 공개 표는 auth.users에 외래 키로 묶여 있지 않을 수 있어 인증 계정만 지우면 행이 고아로 남는다.
// 그래서 한 계정의 삭제는 한 트랜잭션에서 표의 소유 저장 모듈이 공개 표 행을 지우고 마지막에 인증 계정을 지운다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database, Executor } from '../_db/client.js';
import { deleteUserBounty } from './bounty.js';
import { at } from './json.js';
import { deleteUserMails } from './mailbox.js';
import { deleteUserProfile } from './profile.js';
import { deleteUserActivity } from './activity.js';
import { deleteUserPosition } from './position.js';
import { deleteUserBlocks } from './blocks.js';
import { deleteUserChat } from './chat.js';
import { deleteUserFriends } from './friends.js';
import { deleteUserGuild } from './guilds.js';
import { deleteUserSaves } from './save.js';
import { deleteUserEvents } from './telemetry.js';

/** 진행이 없는 게스트를 지우는 미접속 일수 */
const IDLE_DAYS = 7;
/** 진행이 있어도 게스트를 지우는 미접속 일수. 1년은 365일로 센다 */
const STALE_DAYS = 365;

/** 정리 기준 시각. 마지막 접속이 idle보다 이른 빈 게스트와, stale보다 이른 모든 게스트가 대상이다 */
export interface PurgeCutoffs {
  idle: string;
  stale: string;
}

/** 기준 시각(UTC)에서 두 미접속 기간을 뺀 컷오프를 ISO 문자열로 돌려준다 */
function purgeCutoffs(now: Date): PurgeCutoffs {
  const before = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  return { idle: before(IDLE_DAYS), stale: before(STALE_DAYS) };
}

export interface PurgeTargets {
  /** 이번 선정에 쓴 기준 시각 */
  cutoffs: PurgeCutoffs;
  /** 조건에 맞는 계정 전체 수 */
  total: number;
  /** 전체 가운데 오래 접속하지 않은 규칙(stale)에 해당하는 계정 수 */
  stale: number;
  /** 상한까지, 마지막 활동이 오래된 계정부터의 id */
  ids: string[];
}

/**
 * 정리 대상 조건이다. 선정과 삭제 직전 재확인이 같은 정의를 쓴다. 기준 시각은 now에서 이 모듈이 정한다.
 * 대상은 익명(게스트) 계정이다. 구글이나 이메일로 연결된 계정은 익명 표시가 풀려 대상이 아니다.
 * 마지막 접속(seen.at)은 저장 갱신(구 saves 행의 저장 시각 포함)·세션 사용·가입 가운데 가장 늦은 시각이다.
 * 세션 사용 시각은 그 계정 세션의 갱신 시각 가운데 가장 늦은 값이다.
 * greatest는 null을 건너뛰고 가입 시각은 비지 않으므로 마지막 접속은 항상 정해진다.
 * 두 규칙 중 하나를 채우면 대상이다. 판정은 rule.by_stale, rule.by_idle 열 하나씩이고 선정 수 집계도 이 열을 쓴다.
 *  - by_idle, 진행이 없는 게스트: 저장 상태가 비었거나(골드·명성 0) 저장이 없고, 마지막 접속이 idle보다 이르다.
 *    저장 상태가 없어도 구 saves 행이 있으면 정규화 이전 진행이 남아 있을 수 있어 이 규칙에서는 뺀다.
 *  - by_stale, 오래 접속하지 않은 게스트: 진행과 관계없이 마지막 접속이 stale보다 이르다.
 * 두 규칙 모두 제재·관리자 계정과 개발자에게 편지를 보낸 계정은 뺀다.
 * 편지는 인증 계정에 연쇄 삭제로 묶여 있어 보존하려고 계정을 지우지 않는다.
 */
const targetFrom = (cutoffs: PurgeCutoffs): SQL => sql`from auth.users u
  left join public.saves_current c on c.user_id = u.id
  cross join lateral (select greatest(c.updated_at, (select max(s.updated_at) from auth.sessions s where s.user_id = u.id),
    (select max(v.updated_at) from public.saves v where v.user_id = u.id), u.created_at) as at) seen
  cross join lateral (select seen.at < ${at(cutoffs.stale)} as by_stale,
    (seen.at < ${at(cutoffs.idle)}
      and ((c.user_id is not null and c.gold = 0 and c.fame = 0)
        or (c.user_id is null and not exists (select 1 from public.saves s where s.user_id = u.id)))) as by_idle) rule
  where u.is_anonymous
    and (rule.by_stale or rule.by_idle)
    and not coalesce(c.restricted, false)
    and not exists (select 1 from public.admins a where a.user_id = u.id)
    and not exists (select 1 from public.letters l where l.user_id = u.id)`;

/** 정리 대상을 마지막 활동이 오래된 순으로 상한까지 고른다. 지우지 않는다 */
export async function selectPurgeTargets(db: Executor, now: Date, limit: number): Promise<PurgeTargets> {
  const cutoffs = purgeCutoffs(now);
  const { rows } = await db.execute<{ id: string; total: number; stale: number }>(sql`select u.id::text as id,
      count(*) over ()::int as total,
      (count(*) filter (where rule.by_stale) over ())::int as stale
    ${targetFrom(cutoffs)}
    order by seen.at, u.id
    limit ${limit}`);
  return { cutoffs, total: rows[0]?.total ?? 0, stale: rows[0]?.stale ?? 0, ids: rows.map(r => r.id) };
}

/**
 * 한 계정의 공개 표 행과 인증 계정을 한 트랜잭션에서 지운다. 지웠으면 true다.
 * 선정 뒤에 대상 조건에서 벗어난 계정(접속·골드 획득·이미 삭제)은 아무것도 지우지 않고 false를 돌려준다.
 * 중간에 실패하면 던지고 그 계정은 그대로 남는다.
 */
export async function purgeAccount(withTransaction: Database['withTransaction'], uid: string, now: Date): Promise<boolean> {
  return withTransaction(async tx => {
    // 저장 행을 먼저 잠가 확인한 상태가 커밋까지 바뀌지 않게 한다. 액션 확정은 이 행을 갱신하므로
    // 잠금이 풀린 뒤에는 행이 없어 낙관 락 경합으로 끝난다. 인증 계정 행도 잠가 계정 변경이 끼어들지 못하게 한다.
    await tx.execute(sql`select 1 from public.saves_current where user_id = ${uid} for update`);
    const { rows } = await tx.execute(sql`select u.id ${targetFrom(purgeCutoffs(now))} and u.id = ${uid} for update of u`);
    if (rows.length === 0) return false;
    await deleteAccountRows(tx, uid);
    return true;
  });
}

/** 본인 탈퇴의 결과. admin은 관리자 계정이라 지우지 않았고, missing은 인증 계정이 이미 없다 */
export type OwnDeletion = 'deleted' | 'admin' | 'missing';

/**
 * 본인 요청으로 계정을 지운다. 익명 계정과 이메일 계정 모두 대상이다.
 * 정리 대상 조건 없이 계정의 공개 표 행과 인증 계정을 한 트랜잭션에서 지운다. 편지는 인증 계정에 연쇄 삭제로 묶여 함께 사라진다.
 * 관리자 계정은 지우지 않는다. 중간에 실패하면 던지고 계정은 그대로 남는다.
 */
export async function deleteOwnAccount(withTransaction: Database['withTransaction'], uid: string): Promise<OwnDeletion> {
  return withTransaction(async tx => {
    // 저장 행과 인증 계정 행을 잠가 진행 중인 액션 확정이 끝난 뒤 지운다. 이후의 확정은 행이 없어 낙관 락 경합으로 끝난다
    await tx.execute(sql`select 1 from public.saves_current where user_id = ${uid} for update`);
    const { rows } = await tx.execute<{ admin: boolean }>(sql`select exists (select 1 from public.admins a where a.user_id = u.id) as admin
      from auth.users u where u.id = ${uid} for update of u`);
    if (rows.length === 0) return 'missing';
    if (rows[0].admin) return 'admin';
    await deleteAccountRows(tx, uid);
    return 'deleted';
  });
}

/** 계정의 공개 표 행을 표의 소유 저장 모듈로 지우고 마지막에 인증 계정을 지운다 */
async function deleteAccountRows(tx: Executor, uid: string): Promise<void> {
  await deleteUserEvents(tx, uid);
  await deleteUserBounty(tx, uid);
  await deleteUserMails(tx, uid);
  await deleteUserProfile(tx, uid);
  await deleteUserBlocks(tx, uid);
  await deleteUserChat(tx, uid);
  await deleteUserFriends(tx, uid);
  await deleteUserGuild(tx, uid);
  await deleteUserActivity(tx, uid);
  await deleteUserPosition(tx, uid);
  await deleteUserSaves(tx, uid);
  await tx.execute(sql`delete from auth.users where id = ${uid}`);
}

/** 비밀번호 재설정 대상으로서의 계정 상태. member는 가입 계정, anonymous는 게스트 계정, missing은 인증 계정이 없다 */
export type AccountKind = 'member' | 'anonymous' | 'missing';

export async function accountKind(db: Executor, uid: string): Promise<AccountKind> {
  const { rows } = await db.execute<{ is_anonymous: boolean | null }>(sql`select is_anonymous from auth.users where id = ${uid}`);
  if (rows.length === 0) return 'missing';
  return rows[0].is_anonymous ? 'anonymous' : 'member';
}

/**
 * 비밀번호 재설정 토큰을 Better Auth의 재설정 요청(request-password-reset)과 같은 행으로 넣는다.
 * identifier는 'reset-password:<토큰>', value는 사용자 id다. 재설정(reset-password)이 이 행을 찾아 쓰고 지운다.
 */
export async function insertPasswordResetToken(db: Executor, uid: string, token: string, expiresAtISO: string): Promise<void> {
  await db.execute(sql`insert into auth.verifications (identifier, value, expires_at)
    values (${`reset-password:${token}`}, ${uid}, ${at(expiresAtISO)})`);
}
