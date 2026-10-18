// 인증 계정(auth.users) 정리 소유 모듈. 빈 익명 계정의 대상 선정과 계정 단위 삭제를 맡는다.
// 공개 표는 auth.users에 외래 키로 묶여 있지 않을 수 있어 인증 계정만 지우면 행이 고아로 남는다.
// 그래서 한 계정의 삭제는 한 트랜잭션에서 표의 소유 저장 모듈이 공개 표 행을 지우고 마지막에 인증 계정을 지운다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database, Executor } from '../_db/client.js';
import { deleteUserBounty } from './bounty.js';
import { at } from './json.js';
import { deleteUserProfile } from './profile.js';
import { deleteUserSaves } from './save.js';
import { deleteUserEvents } from './telemetry.js';

export interface PurgeTargets {
  /** 조건에 맞는 계정 전체 수 */
  total: number;
  /** 상한까지, 마지막 활동이 오래된 계정부터의 id */
  ids: string[];
}

/**
 * 정리 대상 조건이다. 선정과 삭제 직전 재확인이 같은 정의를 쓴다.
 * 이메일이 없고 이메일 변경 확인을 기다리지 않는 익명 계정 가운데 저장 상태가 비었거나(골드·명성 0) 저장이 없고,
 * 제재·관리자가 아니며, 마지막 활동(저장 갱신·로그인·가입 중 가장 늦은 시각)이 컷오프보다 이른 계정이다.
 * email_change에 주소가 있으면 가입을 시도하고 이메일 확인을 기다리는 계정이다.
 * greatest는 null을 건너뛰므로 시각이 하나라도 있으면 그중 가장 늦은 값이고, 전부 null이면 대상이 아니다.
 * 저장 상태가 없어도 구 saves 행이 있으면 정규화 이전 진행이 남아 있을 수 있어 대상에서 뺀다.
 * 개발자에게 편지를 보낸 계정은 편지(인증 계정에 연쇄 삭제로 묶여 있다)를 보존하려고 대상에서 뺀다.
 */
const targetFrom = (cutoffISO: string): SQL => sql`from auth.users u
  left join public.saves_current c on c.user_id = u.id
  where u.is_anonymous and u.email is null and coalesce(u.email_change, '') = ''
    and ((c.user_id is not null and c.gold = 0 and c.fame = 0)
      or (c.user_id is null and not exists (select 1 from public.saves s where s.user_id = u.id)))
    and not coalesce(c.restricted, false)
    and greatest(c.updated_at, u.last_sign_in_at, u.created_at) < ${at(cutoffISO)}
    and not exists (select 1 from public.admins a where a.user_id = u.id)
    and not exists (select 1 from public.letters l where l.user_id = u.id)`;

/** 정리 대상을 마지막 활동이 오래된 순으로 상한까지 고른다. 지우지 않는다 */
export async function selectPurgeTargets(db: Executor, cutoffISO: string, limit: number): Promise<PurgeTargets> {
  const { rows } = await db.execute<{ id: string; total: number }>(sql`select u.id::text as id, count(*) over ()::int as total
    ${targetFrom(cutoffISO)}
    order by greatest(c.updated_at, u.last_sign_in_at, u.created_at), u.id
    limit ${limit}`);
  return { total: rows[0]?.total ?? 0, ids: rows.map(r => r.id) };
}

/**
 * 한 계정의 공개 표 행과 인증 계정을 한 트랜잭션에서 지운다. 지웠으면 true다.
 * 선정 뒤에 대상 조건에서 벗어난 계정(활동·골드 획득·이미 삭제)은 아무것도 지우지 않고 false를 돌려준다.
 * 중간에 실패하면 던지고 그 계정은 그대로 남는다.
 */
export async function purgeAccount(withTransaction: Database['withTransaction'], uid: string, cutoffISO: string): Promise<boolean> {
  return withTransaction(async tx => {
    // 저장 행을 먼저 잠가 확인한 상태가 커밋까지 바뀌지 않게 한다. 액션 확정은 이 행을 갱신하므로
    // 잠금이 풀린 뒤에는 행이 없어 낙관 락 경합으로 끝난다. 인증 계정 행도 잠가 로그인 갱신이 끼어들지 못하게 한다.
    await tx.execute(sql`select 1 from public.saves_current where user_id = ${uid} for update`);
    const { rows } = await tx.execute(sql`select u.id ${targetFrom(cutoffISO)} and u.id = ${uid} for update of u`);
    if (rows.length === 0) return false;
    await deleteUserEvents(tx, uid);
    await deleteUserBounty(tx, uid);
    await deleteUserProfile(tx, uid);
    await deleteUserSaves(tx, uid);
    await tx.execute(sql`delete from auth.users where id = ${uid}`);
    return true;
  });
}
