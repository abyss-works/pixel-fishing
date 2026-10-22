// 계정 정리 테스트의 공용 시딩과 행 수 조회. 계정 행을 가진 공개 표 목록의 정본이기도 하다.
import type { Client } from 'pg';
import { fish, seedUser, testUid } from './actionHarness.js';

/** 계정 행을 가진 공개 표 전부. 계정 정리가 비워야 하는 목록이다 */
export const USER_TABLES = [
  'saves_current', 'fish_instances', 'records', 'saves', 'profiles', 'events', 'letters', 'mails',
  'bounty_licenses', 'bounty_accepts', 'bounty_clears', 'bounty_progress', 'bounty_tickets',
] as const;
/** 저장 상태에 딸린 표. 저장이 없는 계정은 이 표에 행이 없다 */
const SAVE_TABLES: readonly string[] = ['saves_current', 'fish_instances', 'records', 'saves'];

export interface AccountSpec {
  /** 지정하지 않으면 이메일이 없을 때 익명이다 */
  anonymous?: boolean;
  email?: string;
  /** 이메일 변경 확인을 기다리는 주소(email_change) */
  pendingEmail?: string;
  /** null이면 saves_current 행이 없다 */
  save: { gold?: number; fame?: number; updatedAt: string; restricted?: boolean } | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  admin?: boolean;
  /** saves_current 없이 구 saves 행만 있는 계정 */
  legacySave?: boolean;
  /** 개발자에게 보낸 편지가 있는 계정 */
  letter?: boolean;
}

let seq = 100;

/** 인증 계정과 저장 상태를 만들고 인증 계정의 시각과 익명 여부를 지정한다 */
export async function seedAccount(client: Client, spec: AccountSpec): Promise<string> {
  const uid = testUid(seq++);
  await seedUser(client, {
    uid, email: spec.email ?? null, nickname: null,
    ...(spec.save ? {
      state: { gold: spec.save.gold ?? 0, fame: spec.save.fame ?? 0 },
      updatedAt: spec.save.updatedAt, restricted: spec.save.restricted ?? false,
    } : {}),
  });
  await client.query('update auth.users set created_at = $2, last_sign_in_at = $3, is_anonymous = $4, email_change = $5 where id = $1',
    [uid, spec.createdAt, spec.lastSignInAt, spec.anonymous ?? spec.email === undefined, spec.pendingEmail ?? null]);
  if (spec.admin) await client.query('insert into public.admins (user_id) values ($1)', [uid]);
  if (spec.legacySave) {
    await client.query('insert into public.saves (user_id, data) values ($1, $2)', [uid, { v: 4, gold: 0 }]);
  }
  return uid;
}

/** 계정 행을 공개 표에 하나씩 만든다. 저장이 없는 계정은 저장 상태에 딸린 표를 비워 둔다 */
export async function seedFullAccount(client: Client, spec: AccountSpec & { nickname: string }): Promise<string> {
  const uid = await seedAccount(client, spec);
  await client.query('insert into public.profiles (user_id, nickname) values ($1, $2)', [uid, spec.nickname]);
  await client.query(`insert into public.events (user_id, type, payload) values ($1, 'boot', '{}')`, [uid]);
  if (spec.letter) await client.query(`insert into public.letters (user_id, text) values ($1, '편지')`, [uid]);
  await client.query(`insert into public.mails (user_id, title, body, gold) values ($1, '우편', '본문', 100)`, [uid]);
  await client.query(`insert into public.bounty_licenses (user_id, zone) values ($1, 'pacific')`, [uid]);
  await client.query(`insert into public.bounty_accepts (user_id, zone, port, quest_id) values ($1, 'pacific', 'harbor', 'q1')`, [uid]);
  await client.query(`insert into public.bounty_progress (user_id, zone, quest_id) values ($1, 'pacific', 'q1')`, [uid]);
  await client.query(`insert into public.bounty_tickets (user_id, quest_id) values ($1, 'q1')`, [uid]);
  await client.query(`insert into public.bounty_clears (user_id, kind, quest_id) values ($1, 'general', 'q0')`, [uid]);
  if (spec.save) {
    await client.query(`insert into public.fish_instances (uid, user_id, fish_id, form) values ($1, $2, 'crucian', 'normal')`,
      [fish('crucian').uid, uid]);
    await client.query(`insert into public.records (user_id, fish_id, form, count) values ($1, 'crucian', 'normal', 1)`, [uid]);
    await client.query(`insert into public.saves (user_id, data) values ($1, '{"v":8}')`, [uid]);
  }
  return uid;
}

/** 계정의 표별 행 수. 인증 계정은 auth.users 항목이다 */
export async function rowCounts(client: Client, uid: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of USER_TABLES) {
    const { rows } = await client.query<{ n: number }>(`select count(*)::int as n from public.${table} where user_id = $1`, [uid]);
    out[table] = rows[0].n;
  }
  const { rows } = await client.query<{ n: number }>('select count(*)::int as n from auth.users where id = $1', [uid]);
  out['auth.users'] = rows[0].n;
  return out;
}

/** seedFullAccount 직후의 표별 행 수 */
export const seeded = (hasSave: boolean, hasLetter = false): Record<string, number> => Object.fromEntries([...USER_TABLES, 'auth.users']
  .map(table => [table, (SAVE_TABLES.includes(table) && !hasSave) || (table === 'letters' && !hasLetter) ? 0 : 1]));

/** 계정을 지운 뒤의 표별 행 수 */
export const GONE: Record<string, number> = Object.fromEntries([...USER_TABLES, 'auth.users'].map(table => [table, 0]));
