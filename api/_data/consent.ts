// 약관과 개인정보 처리방침의 수락 기록 저장 모듈 — 계정, 문서, 판마다 한 행(consent_records)을 쓰고 읽는다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { CONSENT_DOCUMENTS, consentRequired } from '../_auth/consentPolicy.js';
import type { ConsentChannel, ConsentPolicy } from '../_auth/consentPolicy.js';
import type { SessionUser } from '../_auth/session.js';

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

/** 계정 정보 조회와 수락 응답이 담는 약관 상태 */
export interface ConsentStatus {
  /** 확인 화면을 보여야 하고 게임 요청을 받지 않는 계정인가 */
  required: boolean;
  /** 현재 판. 시행일 문자열이다 */
  version: string;
  /** 시행 시각(ISO, UTC) */
  effectiveAt: string;
}

/**
 * 이 사용자가 확인이 필요한 계정인가. 게스트가 아니고, 시행일이 됐고, 현재 판의 수락 기록이 없을 때다.
 * 시행일 전과 게스트는 기록을 읽지 않고 판정한다.
 */
export async function consentRequiredFor(db: Executor, user: SessionUser, policy: ConsentPolicy, now: Date): Promise<boolean> {
  const guest = user.email === null;
  if (guest || now.getTime() < policy.effectiveAt.getTime()) return false;
  return consentRequired(policy, now, { guest, accepted: await hasAcceptedVersion(db, user.id, policy.version) });
}

/** 사용자의 약관 상태 */
export async function consentStatus(db: Executor, user: SessionUser, policy: ConsentPolicy, now: Date): Promise<ConsentStatus> {
  return {
    required: await consentRequiredFor(db, user, policy, now),
    version: policy.version,
    effectiveAt: policy.effectiveAt.toISOString(),
  };
}
