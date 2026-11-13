// 약관과 개인정보 처리방침의 수락 기록 저장 모듈 — 계정, 문서, 판마다 한 행(consent_records)을 쓰고 읽는다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { CONSENT_DOCUMENTS } from '../_auth/consentPolicy.js';
import type { ConsentChannel } from '../_auth/consentPolicy.js';

/**
 * 그 계정이 그 판의 약관과 처리방침을 수락한 것으로 기록한다. 두 문서를 한 문장으로 쓰므로 한쪽만 남지 않는다.
 * 만 14세 이상 확인은 두 수락 경로 모두 참으로 받는다. 이미 같은 판의 기록이 있으면 새로 쓰지 않는다.
 */
export async function recordConsent(db: Executor, uid: string, version: string, channel: ConsentChannel): Promise<void> {
  const values = CONSENT_DOCUMENTS.map(document => sql`(${uid}::uuid, ${document}, ${version}, true, ${channel})`);
  await db.execute(sql`insert into public.consent_records (user_id, document, version, age_confirmed, channel)
    values ${sql.join(values, sql`, `)} on conflict (user_id, document, version) do nothing`);
}

/** 그 계정이 그 판의 모든 문서를 수락했는가 */
export async function hasAcceptedVersion(db: Executor, uid: string, version: string): Promise<boolean> {
  const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from public.consent_records
    where user_id = ${uid} and version = ${version} and document in (${sql.join(CONSENT_DOCUMENTS.map(document => sql`${document}`), sql`, `)})`);
  return rows[0].n === CONSENT_DOCUMENTS.length;
}

/** 계정 삭제에서 사용자의 수락 기록을 지운다 */
export async function deleteUserConsents(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.consent_records where user_id = ${uid}`);
}
