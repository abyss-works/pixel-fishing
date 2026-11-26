// 위젯 인증 코드(widget_auth_codes)·위젯 Bearer 토큰(widget_tokens) 쓰기 소유 모듈.
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { at } from './json.js';

/** 원문 코드·토큰 문자열의 SHA-256 16진수 해시를 계산한다 */
export function sha256Hex(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export interface WidgetAuthCodeRow {
  codeHash: string;
  userId: string;
  codeChallenge: string;
  redirectUri: string;
  expiresAt: Date;
}

export interface WidgetTokenSaveState {
  restricted: boolean;
  lastSpot: string | null;
  lastCatchAt: string | null;
  boat: number;
  data: unknown;
}

export interface WidgetTokenAuthRow {
  tokenHash: string;
  userId: string;
  clientVersion: string;
  lastSeenAt: Date;
  expiresAt: Date;
  isGuest: boolean;
  hasGoogle: boolean;
  isAdmin: boolean;
  restricted: boolean;
  lastSpot: string | null;
  saveState: WidgetTokenSaveState | null;
}

export interface WidgetUserEligibility {
  userId: string;
  isGuest: boolean;
  hasGoogle: boolean;
  isAdmin: boolean;
  restricted: boolean;
}

/** 일회용 PKCE 인증 코드 해시를 저장한다 */
export async function createWidgetAuthCode(
  db: Executor,
  input: {
    codeHash: string;
    userId: string;
    codeChallenge: string;
    redirectUri: string;
    expiresAt: string;
  },
): Promise<void> {
  await db.execute(sql`
    insert into public.widget_auth_codes (code_hash, user_id, code_challenge, redirect_uri, expires_at)
    values (${input.codeHash}, ${input.userId}::uuid, ${input.codeChallenge}, ${input.redirectUri}, ${at(input.expiresAt)})
  `);
}

/**
 * 일회용 PKCE 인증 코드를 원자적으로 삭제·소비한다.
 * 코드가 없거나 만료됐으면 null을 돌려준다.
 */
export async function consumeWidgetAuthCode(
  db: Executor,
  codeHash: string,
  nowISO: string = new Date().toISOString(),
): Promise<WidgetAuthCodeRow | null> {
  const { rows } = await db.execute<{
    code_hash: string;
    user_id: string;
    code_challenge: string;
    redirect_uri: string;
    expires_at: string;
  }>(sql`
    delete from public.widget_auth_codes
    where code_hash = ${codeHash}
    returning code_hash, user_id::text as user_id, code_challenge, redirect_uri, expires_at
  `);
  const row = rows[0];
  if (!row) return null;
  const expiresAt = new Date(row.expires_at);
  if (expiresAt.getTime() <= Date.parse(nowISO)) return null;
  return {
    codeHash: row.code_hash,
    userId: row.user_id,
    codeChallenge: row.code_challenge,
    redirectUri: row.redirect_uri,
    expiresAt,
  };
}

/** 위젯 전용 Bearer 토큰 해시를 저장한다 */
export async function createWidgetToken(
  db: Executor,
  input: {
    tokenHash: string;
    userId: string;
    clientVersion: string;
    expiresAt: string;
  },
): Promise<void> {
  await db.execute(sql`
    insert into public.widget_tokens (token_hash, user_id, client_version, expires_at)
    values (${input.tokenHash}, ${input.userId}::uuid, ${input.clientVersion}, ${at(input.expiresAt)})
  `);
}

/** 유효한 위젯 Bearer 토큰과 사용자·구글 연결·관리자·저장 상태를 함께 조회한다 */
export async function findWidgetTokenWithUser(
  db: Executor,
  tokenHash: string,
  nowISO: string = new Date().toISOString(),
): Promise<WidgetTokenAuthRow | null> {
  const { rows } = await db.execute<{
    token_hash: string;
    user_id: string;
    client_version: string;
    last_seen_at: string;
    expires_at: string;
    is_guest: boolean;
    has_google: boolean;
    is_admin: boolean;
    has_save: boolean;
    restricted: boolean;
    last_spot: string | null;
    last_catch_at: string | null;
    boat: number | null;
    save_data: unknown;
  }>(sql`
    select
      t.token_hash,
      t.user_id::text as user_id,
      t.client_version,
      t.last_seen_at,
      t.expires_at,
      (u.email is null or coalesce(u.is_anonymous, false)) as is_guest,
      exists (
        select 1 from auth.accounts a
        where a.user_id = t.user_id and a.provider_id = 'google'
      ) as has_google,
      exists (
        select 1 from public.admins ad
        where ad.user_id = t.user_id
      ) as is_admin,
      (s.user_id is not null) as has_save,
      coalesce(s.restricted, false) as restricted,
      s.last_spot,
      s.last_catch_at,
      s.boat,
      s.data as save_data
    from public.widget_tokens t
    join auth.users u on u.id = t.user_id
    left join public.saves_current s on s.user_id = t.user_id
    where t.token_hash = ${tokenHash}
      and t.expires_at > ${at(nowISO)}
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    clientVersion: row.client_version,
    lastSeenAt: new Date(row.last_seen_at),
    expiresAt: new Date(row.expires_at),
    isGuest: Boolean(row.is_guest),
    hasGoogle: Boolean(row.has_google),
    isAdmin: Boolean(row.is_admin),
    restricted: Boolean(row.restricted),
    lastSpot: row.last_spot ?? null,
    saveState: row.has_save
      ? {
          restricted: Boolean(row.restricted),
          lastSpot: row.last_spot ?? null,
          lastCatchAt: row.last_catch_at ?? null,
          boat: Number(row.boat ?? 0),
          data: row.save_data,
        }
      : null,
  };
}

/** 위젯 토큰의 최근 사용 시각(last_seen_at)을 갱신한다 */
export async function touchWidgetToken(
  db: Executor,
  tokenHash: string,
  nowISO: string = new Date().toISOString(),
): Promise<void> {
  await db.execute(sql`
    update public.widget_tokens
    set last_seen_at = ${at(nowISO)}
    where token_hash = ${tokenHash}
  `);
}

/** 단일 위젯 토큰을 삭제하고, 삭제된 행의 사용자 id를 돌려준다(없으면 null) */
export async function deleteWidgetToken(db: Executor, tokenHash: string): Promise<string | null> {
  const { rows } = await db.execute<{ user_id: string }>(sql`
    delete from public.widget_tokens
    where token_hash = ${tokenHash}
    returning user_id::text as user_id
  `);
  return rows[0]?.user_id ?? null;
}

/** 대상 사용자의 모든 위젯 토큰을 삭제하고 삭제된 행 수를 돌려준다 */
export async function deleteWidgetTokensForUser(db: Executor, uid: string): Promise<number> {
  const result = await db.execute(sql`delete from public.widget_tokens where user_id = ${uid}::uuid`);
  return result.rowCount ?? 0;
}

/** 계정 삭제 시 사용자의 위젯 인증 코드와 토큰을 모두 삭제한다 */
export async function deleteUserWidgetAuth(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.widget_auth_codes where user_id = ${uid}::uuid`);
  await db.execute(sql`delete from public.widget_tokens where user_id = ${uid}::uuid`);
}

/** 계정에 구글 OAuth 로그인 수단(auth.accounts provider_id='google')이 연결되어 있는지 확인한다 */
export async function hasGoogleProviderLink(db: Executor, uid: string): Promise<boolean> {
  const { rows } = await db.execute<{ linked: boolean }>(sql`
    select exists (
      select 1 from auth.accounts
      where user_id = ${uid}::uuid and provider_id = 'google'
    ) as linked
  `);
  return Boolean(rows[0]?.linked);
}

/** 위젯 인증 코드 발급·토큰 교환 시 대상 계정의 구글 연결·관리자·제재 상태를 한 번에 조회한다 */
export async function getWidgetUserEligibility(db: Executor, uid: string): Promise<WidgetUserEligibility | null> {
  const { rows } = await db.execute<{
    user_id: string;
    is_guest: boolean;
    has_google: boolean;
    is_admin: boolean;
    restricted: boolean;
  }>(sql`
    select
      u.id::text as user_id,
      (u.email is null or coalesce(u.is_anonymous, false)) as is_guest,
      exists (
        select 1 from auth.accounts a
        where a.user_id = u.id and a.provider_id = 'google'
      ) as has_google,
      exists (
        select 1 from public.admins ad
        where ad.user_id = u.id
      ) as is_admin,
      coalesce(s.restricted, false) as restricted
    from auth.users u
    left join public.saves_current s on s.user_id = u.id
    where u.id = ${uid}::uuid
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    isGuest: Boolean(row.is_guest),
    hasGoogle: Boolean(row.has_google),
    isAdmin: Boolean(row.is_admin),
    restricted: Boolean(row.restricted),
  };
}
