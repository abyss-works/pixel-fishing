// 계정 정리 테스트의 공용 시딩과 행 수 조회. 계정 행을 가진 공개 표 목록의 정본이기도 하다.
import type { Client } from 'pg';
import { fish, seedUser, testUid } from './actionHarness.js';

/** 계정 행을 가진 공개 표 전부. 계정 정리가 비워야 하는 목록이다 */
export const USER_TABLES = [
  'saves_current', 'fish_instances', 'records', 'saves', 'profiles', 'events', 'letters', 'mails',
  'bounty_licenses', 'bounty_accepts', 'bounty_clears', 'bounty_progress', 'bounty_tickets', 'blocks',
  'chat_messages', 'chat_reports', 'play_sessions', 'user_active_days', 'guild_members', 'guild_contributions', 'guild_logs',
  'guild_bonus_donations', 'guild_member_enhancements', 'guild_rejoin_cooldowns', 'last_positions', 'guild_join_requests', 'consent_records',
  'achievement_counters', 'daily_fortunes', 'ranking_weekly_fame', 'ranking_weekly_sell_gold', 'integrity_states', 'integrity_events',
  'coupon_redemptions', 'event_trio_progress', 'event_championship_scores', 'event_draws',
  'widget_auth_codes', 'widget_tokens',
] as const;
/** 저장 상태에 딸린 표. 저장이 없는 계정은 이 표에 행이 없다 */
const SAVE_TABLES: readonly string[] = ['saves_current', 'fish_instances', 'records', 'saves'];

export interface AccountSpec {
  /** 지정하지 않으면 이메일이 없을 때 익명이다 */
  anonymous?: boolean;
  email?: string;
  /** null이면 saves_current 행이 없다 */
  save: { gold?: number; fame?: number; updatedAt: string; restricted?: boolean } | null;
  createdAt: string;
  /** 세션의 마지막 사용 시각 */
  lastSignInAt: string | null;
  admin?: boolean;
  /** saves_current 없이 구 saves 행만 있는 계정 */
  legacySave?: boolean;
  /** 구 saves 행의 저장 시각. 지정하지 않으면 가입 시각이다 */
  legacySaveAt?: string;
  /** 개발자에게 보낸 편지가 있는 계정 */
  letter?: boolean;
  /** auth.accounts 행으로 연결할 로그인 수단(예: 'google') */
  provider?: string;
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
  await client.query('update auth.users set created_at = $2, is_anonymous = $3 where id = $1',
    [uid, spec.createdAt, spec.anonymous ?? spec.email === undefined]);
  // 세션 사용 시각이 없으면 세션이 없는 계정이다. 가입 시각만 활동 근거로 남는다
  if (spec.lastSignInAt) await client.query('update auth.sessions set updated_at = $2 where user_id = $1', [uid, spec.lastSignInAt]);
  else await client.query('delete from auth.sessions where user_id = $1', [uid]);
  if (spec.admin) await client.query('insert into public.admins (user_id) values ($1)', [uid]);
  if (spec.provider) {
    await client.query(
      'insert into auth.accounts (user_id, account_id, provider_id, created_at, updated_at) values ($1, $2, $3, $4, $4)',
      [uid, `${spec.provider}-${uid}`, spec.provider, spec.createdAt],
    );
  }
  if (spec.legacySave) {
    await client.query('insert into public.saves (user_id, data, updated_at) values ($1, $2, $3)',
      [uid, { v: 4, gold: 0 }, spec.legacySaveAt ?? spec.createdAt]);
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
  // 차단은 상대 계정이 있어야 한다 — 이 계정이 차단한 행 하나와 이 계정을 차단한 행 하나를 만든다
  const other = testUid(seq++);
  await seedUser(client, { uid: other, email: null, nickname: null });
  await client.query('insert into public.blocks (user_id, blocked_id) values ($1, $2), ($2, $1)', [uid, other]);
  // 채팅 — 이 계정이 보낸 메시지 하나와 이 계정이 낸 신고 하나
  const { rows: [chat] } = await client.query<{ id: string }>(
    `insert into public.chat_messages (user_id, nick, text) values ($1, $2, '안녕') returning id`, [uid, spec.nickname]);
  await client.query(`insert into public.chat_reports (user_id, message_id, target_id, lines) values ($1, $2, $3, '[]')`,
    [uid, chat.id, other]);
  // 길드 — 이 계정이 길드장인 길드 하나(혼자라 계정 정리 때 길드도 없어진다)
  const { rows: [guild] } = await client.query<{ id: string }>(
    'insert into public.guilds (name, code) values ($1, upper(substr(md5(random()::text), 1, 8))) returning id', [`g-${spec.nickname}`]);
  await client.query(`insert into public.guild_members (guild_id, user_id, role) values ($1, $2, 'leader')`, [guild.id, uid]);
  await client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame) values ($1, $2, current_date, 10)`, [guild.id, uid]);
  await client.query(`insert into public.guild_logs (guild_id, user_id, kind) values ($1, $2, 'join')`, [guild.id, uid]);
  await client.query(`insert into public.guild_bonus_donations (guild_id, user_id, bonus, gold) values ($1, $2, 'sell', 100)`, [guild.id, uid]);
  await client.query(`insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank) values ($1, $2, 'sell', 1)`, [guild.id, uid]);
  await client.query(`insert into public.guild_rejoin_cooldowns (user_id, left_at) values ($1, now())`, [uid]);
  await client.query(`insert into public.guild_join_requests (user_id, guild_id) values ($1, $2)`, [uid, guild.id]);
  await client.query(`insert into public.play_sessions (user_id, started_at, ended_at, duration_sec) values ($1, now(), now(), 0)`, [uid]);
  await client.query(`insert into public.user_active_days (user_id, day) values ($1, current_date)`, [uid]);
  await client.query(`insert into public.last_positions (user_id, region, x, y) values ($1, 'world', 10, 20)`, [uid]);
  await client.query(`insert into public.consent_records (user_id, document, version, age_confirmed, channel) values ($1, 'terms', '2030-01-01', true, 'google-link')`, [uid]);
  await client.query(`insert into public.achievement_counters (user_id, key, value) values ($1, 'sell.gold', 0)`, [uid]);
  await client.query(`insert into public.daily_fortunes (user_id, day, kind, index) values ($1, '2030-01-01', 'fish', 3)`, [uid]);
  await client.query(`insert into public.integrity_states (user_id, pressure, stage, samples) values ($1, 1, 1, '[]')`, [uid]);
  await client.query(`insert into public.integrity_events (user_id, detector, signal, pressure_before, pressure_after, stage_before, stage_after)
    values ($1, 'input-window', '{}', 0, 1, 0, 1)`, [uid]);
  await client.query(`insert into public.coupons (code, gold, description, active) values ('ACCOUNT-FIXTURE', 100, '계정 삭제 테스트', true) on conflict do nothing`);
  await client.query(`insert into public.coupon_redemptions (code, user_id) values ('ACCOUNT-FIXTURE', $1)`, [uid]);
  await client.query(`insert into public.live_events (id, kind, title, starts_at, ends_at) values ('account-fixture-evt', 'trio', '테스트', '2030-01-01T00:00:00Z', '2030-01-02T00:00:00Z') on conflict do nothing`);
  await client.query(`insert into public.event_trio_progress (event_id, user_id) values ('account-fixture-evt', $1)`, [uid]);
  await client.query(`insert into public.event_championship_scores (event_id, user_id) values ('account-fixture-evt', $1)`, [uid]);
  await client.query(`insert into public.event_draws (event_id, user_id, reward_kind) values ('account-fixture-evt', $1, 'none')`, [uid]);
  await client.query(`insert into public.ranking_weekly_fame (week_start, user_id, fame_gained) values ('2030-01-07', $1, 10)`, [uid]);
  await client.query(`insert into public.ranking_weekly_sell_gold (week_start, user_id, gold_earned) values ('2030-01-07', $1, 500)`, [uid]);
  await client.query(
    `insert into public.widget_auth_codes (code_hash, user_id, code_challenge, redirect_uri, expires_at)
     values ($1, $2, 'challenge-fixture', 'http://127.0.0.1:4100/callback', '2099-01-01T00:00:00Z')`,
    [`code-hash-${uid}`, uid],
  );
  await client.query(
    `insert into public.widget_tokens (token_hash, user_id, client_version, expires_at)
     values ($1, $2, '0.1.0', '2099-01-01T00:00:00Z')`,
    [`token-hash-${uid}`, uid],
  );
  if (spec.save) {
    await client.query(`insert into public.fish_instances (uid, user_id, fish_id, form) values ($1, $2, 'crucian', 'normal')`,
      [fish('crucian').uid, uid]);
    await client.query(`insert into public.records (user_id, fish_id, form, count) values ($1, 'crucian', 'normal', 1)`, [uid]);
    await client.query(`insert into public.saves (user_id, data, updated_at) values ($1, '{"v":8}', $2)`,
      [uid, spec.legacySaveAt ?? spec.save.updatedAt]);
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
