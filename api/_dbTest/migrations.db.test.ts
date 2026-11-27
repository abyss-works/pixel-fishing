import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from './testDatabase.js';
import type { TestDatabase } from './testDatabase.js';

describe('테스트 데이터베이스', () => {
  let db: TestDatabase;
  let client: Client;
  beforeAll(async () => {
    db = await createTestDatabase();
    client = new Client({ connectionString: db.url });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
    await db.drop();
  });

  it('번호 마이그레이션이 모두 적용되어 서버가 쓰는 표와 관리자 뷰가 있다', async () => {
    const { rows } = await client.query<{ name: string }>(
      `select table_name as name from information_schema.tables where table_schema = 'public'`);
    const names = rows.map(r => r.name);
    for (const t of ['saves_current', 'fish_instances', 'records', 'saves', 'profiles', 'events', 'letters',
      'coupons', 'reliefs', 'bounty_accepts', 'bounty_progress', 'bounty_tickets', 'bounty_licenses',
      'bounty_clears', 'mails', 'daily_fortunes', 'notices', 'ranking_weekly_fame', 'widget_auth_codes', 'widget_tokens',
      'integrity_states', 'integrity_events', 'v_bounty_funnel_daily']) {
      expect(names).toContain(t);
    }
  });

  it('테스트 프로세스와 DB 세션의 시간대는 UTC다', async () => {
    const { rows } = await client.query<{ tz: string }>(`select current_setting('TimeZone') as tz`);
    expect(rows[0].tz).toBe('UTC');
    expect(process.env.TZ).toBe('UTC');
  });

  describe('bounty_clears (0018)', () => {
    const user = async (): Promise<string> => {
      const uid = randomUUID();
      await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, true)`, [uid, `${uid}@anonymous.invalid`]);
      return uid;
    };

    it('kind는 일반 의뢰와 네임드 토벌만 받는다', async () => {
      const uid = await user();
      await client.query(`insert into public.bounty_clears (user_id, kind, quest_id) values ($1, 'general', 'pacific-easy-common')`, [uid]);
      await client.query(`insert into public.bounty_clears (user_id, kind, quest_id) values ($1, 'named', 'pacific-named-megalodon')`, [uid]);
      await expect(client.query(`insert into public.bounty_clears (user_id, kind, quest_id) values ($1, 'other', 'x')`, [uid]))
        .rejects.toMatchObject({ code: '23514' });
    });

    it('본인 행만 읽고 쓰기는 서버(service role)만 한다 — 인증 사용자는 쓰지 못한다', async () => {
      const a = await user();
      const b = await user();
      for (const uid of [a, b]) {
        await client.query(`insert into public.bounty_clears (user_id, kind, quest_id) values ($1, 'general', 'pacific-easy-common')`, [uid]);
      }
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        // 이미지의 auth.uid()는 요청 클레임 중 sub만 읽는다
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [a]);
        const { rows } = await client.query<{ user_id: string }>('select user_id from public.bounty_clears');
        expect(rows.map(r => r.user_id)).toEqual([a]);
        await expect(client.query(`insert into public.bounty_clears (user_id, kind, quest_id) values ($1, 'general', 'x')`, [a]))
          .rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }
    });
  });

  describe('mails (0019)', () => {
    const user = async (): Promise<string> => {
      const uid = randomUUID();
      await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, true)`, [uid, `${uid}@anonymous.invalid`]);
      return uid;
    };

    it('골드는 0 이상만 받고, 기본값은 0이다', async () => {
      const uid = await user();
      const { rows } = await client.query<{ gold: string }>(
        `insert into public.mails (user_id, title, body) values ($1, '제목', '본문') returning gold`, [uid]);
      expect(Number(rows[0].gold)).toBe(0);
      await expect(client.query(`insert into public.mails (user_id, title, body, gold) values ($1, 't', 'b', -1)`, [uid]))
        .rejects.toMatchObject({ code: '23514' });
    });

    it('인증 사용자는 본인 우편도 읽거나 쓰지 못한다 — 서버(service role) 전용', async () => {
      const a = await user();
      await client.query(`insert into public.mails (user_id, title, body) values ($1, 't', 'b')`, [a]);
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [a]);
        const { rows } = await client.query('select id from public.mails');
        expect(rows).toEqual([]);
        await expect(client.query(`insert into public.mails (user_id, title, body) values ($1, 't', 'b')`, [a]))
          .rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }
    });
  });

  describe('saves_current 캐치 간격·활성 창 (0020)', () => {
    const columns = async (c: Client): Promise<string[]> => {
      const { rows } = await c.query<{ name: string }>(
        `select column_name as name from information_schema.columns
         where table_schema = 'public' and table_name = 'saves_current' and column_name in ('last_catch_at', 'active_client')
         order by column_name`);
      return rows.map(r => r.name);
    };

    it('두 열이 비어 있는 값을 허용하는 채로 있다', async () => {
      expect(await columns(client)).toEqual(['active_client', 'last_catch_at']);
      const { rows } = await client.query<{ nullable: string }>(
        `select is_nullable as nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'saves_current' and column_name in ('last_catch_at', 'active_client')`);
      expect(rows.every(r => r.nullable === 'YES')).toBe(true);
    });
  });

  describe('편지 처리 시각 (0022)', () => {
    const column = async (c: Client): Promise<{ nullable: string }[]> => (await c.query<{ nullable: string }>(
      `select is_nullable as nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'letters' and column_name = 'handled_at'`)).rows;

    it('처리 시각 열이 비어 있는 값을 허용하는 채로 있다', async () => {
      expect(await column(client)).toEqual([{ nullable: 'YES' }]);
    });
  });

  describe('접속 세션·활동일·일별 집계 (0026)', () => {
    it('인증 사용자는 본인 세션도 읽거나 쓰지 못한다 — 서버 전용', async () => {
      const uid = randomUUID();
      await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, true)`, [uid, `${uid}@anonymous.invalid`]);
      await client.query(`insert into public.play_sessions (user_id, started_at, ended_at, duration_sec) values ($1, now(), now(), 0)`, [uid]);
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
        expect((await client.query('select id from public.play_sessions')).rows).toEqual([]);
        await expect(client.query(`insert into public.user_active_days (user_id, day) values ($1, current_date)`, [uid]))
          .rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }
    });
  });

  describe('이전 인증 표 삭제 (0035)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');
    const exists = async (c: Client) => (await c.query<{ r: string | null }>(`select to_regclass('auth.supabase_users')::text as r`)).rows[0].r !== null;

    it('번호 마이그레이션을 모두 적용한 데이터베이스에는 이전 인증 표가 없고 현재 인증 표는 그대로다', async () => {
      expect(await exists(client)).toBe(false);
      const { rows } = await client.query<{ name: string }>(
        `select table_name as name from information_schema.tables where table_schema = 'auth' order by table_name`);
      expect(rows.map(r => r.name)).toEqual(expect.arrayContaining(['accounts', 'sessions', 'users', 'verifications']));
    });

    it('이전 인증 표가 있으면 지우고, 다시 실행해도 실패하지 않으며 다른 표는 그대로다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query('create table auth.supabase_users (id uuid primary key, email text)');
        await other.query(`insert into auth.supabase_users (id, email) values ($1, 'old@example.test')`, [randomUUID()]);
        const uid = randomUUID();
        await other.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, true)`, [uid, `${uid}@anonymous.invalid`]);
        const sql = migration('0035_drop_supabase_users.sql');

        await other.query(sql);
        expect(await exists(other)).toBe(false);
        await other.query(sql);
        expect(await exists(other)).toBe(false);
        expect((await other.query('select id from auth.users where id = $1', [uid])).rows).toHaveLength(1);
        await other.query('select 1 from public.v_admin_users');
      } finally {
        await other.end();
        await copy.drop();
      }
    });

    it('지울 표를 참조하는 객체가 있으면 객체를 지우지 않고 실패한다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query('create table auth.supabase_users (id uuid primary key, email text)');
        await other.query('create view public.legacy_user_emails as select id, email from auth.supabase_users');

        await expect(other.query(migration('0035_drop_supabase_users.sql'))).rejects.toMatchObject({ code: '2BP01' });
        expect(await exists(other)).toBe(true);
        await other.query('select 1 from public.legacy_user_emails');
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('consent_records (0036)', () => {
    const user = async (c: Client): Promise<string> => {
      const uid = randomUUID();
      await c.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [uid, `${uid}@example.test`]);
      return uid;
    };
    const insert = (c: Client, uid: string, document: string, version: string, channel = 'google-link') => c.query(
      `insert into public.consent_records (user_id, document, version, age_confirmed, channel) values ($1, $2, $3, true, $4)`, [uid, document, version, channel]);

    it('같은 계정, 문서, 판은 한 행이고 문서와 경로와 판 형식은 정해진 값만 받는다', async () => {
      const uid = await user(client);
      await insert(client, uid, 'terms', '2030-01-01');
      await expect(insert(client, uid, 'terms', '2030-01-01', 'confirm-screen')).rejects.toMatchObject({ code: '23505' });
      await insert(client, uid, 'privacy', '2030-01-01');
      await insert(client, uid, 'terms', '2030-02-01');
      await expect(insert(client, uid, 'refund', '2030-01-01')).rejects.toMatchObject({ code: '23514' });
      await expect(insert(client, uid, 'terms', '2030-03-01', 'email')).rejects.toMatchObject({ code: '23514' });
      await expect(insert(client, uid, 'terms', '20300301')).rejects.toMatchObject({ code: '23514' });
    });

    it('수락 시각의 기본값은 현재 시각이고 인증 계정을 지우면 함께 지워진다', async () => {
      const uid = await user(client);
      await insert(client, uid, 'terms', '2030-01-01');
      const { rows } = await client.query<{ fresh: boolean }>(
        `select abs(extract(epoch from now() - accepted_at)) < 60 as fresh from public.consent_records where user_id = $1`, [uid]);
      expect(rows).toEqual([{ fresh: true }]);
      await client.query('delete from auth.users where id = $1', [uid]);
      expect((await client.query('select 1 from public.consent_records where user_id = $1', [uid])).rows).toHaveLength(0);
    });

    it('인증 사용자는 본인 기록도 읽거나 쓰지 못한다 — 서버 전용', async () => {
      const a = await user(client);
      await insert(client, a, 'terms', '2030-01-01');
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [a]);
        const { rows } = await client.query('select user_id from public.consent_records');
        expect(rows).toEqual([]);
        await expect(insert(client, a, 'privacy', '2030-01-01')).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }
    });
  });

  describe('event_consumer_cutoffs (0039)', () => {
    it('기본값과 제약(rule_version >= 1, backfill_status enum)을 강제하고 복합 PK를 쓴다', async () => {
      const { rows } = await client.query<{
        backfilled_through_event_id: string;
        backfill_status: string;
        notes: Record<string, unknown>;
        updated_at: Date;
      }>(
        `insert into public.event_consumer_cutoffs (consumer_key, rule_version, live_since_event_id)
         values ('achievement_counters', 1, 100)
         returning backfilled_through_event_id, backfill_status, notes, updated_at`,
      );
      expect(Number(rows[0].backfilled_through_event_id)).toBe(0);
      expect(rows[0].backfill_status).toBe('pending');
      expect(rows[0].notes).toEqual({});
      expect(rows[0].updated_at).toBeInstanceOf(Date);

      await expect(client.query(
        `insert into public.event_consumer_cutoffs (consumer_key, rule_version) values ('achievement_counters', 1)`,
      )).rejects.toMatchObject({ code: '23505' });
      await expect(client.query(
        `insert into public.event_consumer_cutoffs (consumer_key, rule_version) values ('achievement_counters', 0)`,
      )).rejects.toMatchObject({ code: '23514' });
      await expect(client.query(
        `insert into public.event_consumer_cutoffs (consumer_key, rule_version, backfill_status) values ('achievement_counters', 2, 'invalid')`,
      )).rejects.toMatchObject({ code: '23514' });
    });

    it('인증 사용자는 읽거나 쓰지 못한다 — 서버 전용', async () => {
      await client.query(
        `insert into public.event_consumer_cutoffs (consumer_key, rule_version) values ('cold_archive', 1) on conflict do nothing`,
      );
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        expect((await client.query('select consumer_key from public.event_consumer_cutoffs')).rows).toEqual([]);
        await expect(client.query(
          `insert into public.event_consumer_cutoffs (consumer_key, rule_version) values ('other', 1)`,
        )).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }
    });
  });

  describe('guild_member_enhancements (0040)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');
    const setupGuildUser = async (c: Client) => {
      const uid = randomUUID();
      await c.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [uid, `${uid}@example.test`]);
      const { rows: [g] } = await c.query<{ id: string }>(
        `insert into public.guilds (name, code) values ($1, upper(substr(md5(random()::text), 1, 8))) returning id`,
        [`g${uid.slice(0, 6)}`],
      );
      return { uid, guildId: g.id };
    };

    it('복합 PK·기본값·check 제약(5종 보너스, rank 0~5)과 cascade 삭제를 강제한다', async () => {
      const { uid, guildId } = await setupGuildUser(client);
      const { rows: [inserted] } = await client.query<{ rank: number; updated_at: Date }>(
        `insert into public.guild_member_enhancements (guild_id, user_id, bonus) values ($1, $2, 'sell')
         returning rank, updated_at`,
        [guildId, uid],
      );
      expect(inserted.rank).toBe(0);
      expect(inserted.updated_at).toBeInstanceOf(Date);

      await expect(client.query(
        `insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank) values ($1, $2, 'sell', 1)`,
        [guildId, uid],
      )).rejects.toMatchObject({ code: '23505' });
      await expect(client.query(
        `insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank) values ($1, $2, 'invalid', 1)`,
        [guildId, uid],
      )).rejects.toMatchObject({ code: '23514' });
      await expect(client.query(
        `insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank) values ($1, $2, 'bag', -1)`,
        [guildId, uid],
      )).rejects.toMatchObject({ code: '23514' });
      await expect(client.query(
        `insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank) values ($1, $2, 'bag', 6)`,
        [guildId, uid],
      )).rejects.toMatchObject({ code: '23514' });

      // 길드 삭제 및 사용자 삭제 시 cascade
      await client.query(`delete from public.guilds where id = $1`, [guildId]);
      expect((await client.query(
        `select 1 from public.guild_member_enhancements where guild_id = $1`, [guildId],
      )).rows).toHaveLength(0);

      const second = await setupGuildUser(client);
      await client.query(
        `insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank) values ($1, $2, 'rare', 3)`,
        [second.guildId, second.uid],
      );
      await client.query(`delete from auth.users where id = $1`, [second.uid]);
      expect((await client.query(
        `select 1 from public.guild_member_enhancements where user_id = $1`, [second.uid],
      )).rows).toHaveLength(0);
    });

    it('인증 사용자는 본인 개인 자유 강화 행도 읽거나 쓰지 못한다 — 서버 전용', async () => {
      const { uid, guildId } = await setupGuildUser(client);
      await client.query(
        `insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank) values ($1, $2, 'sell', 2)`,
        [guildId, uid],
      );
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
        expect((await client.query('select bonus from public.guild_member_enhancements')).rows).toEqual([]);
        await expect(client.query(
          `insert into public.guild_member_enhancements (guild_id, user_id, bonus, rank) values ($1, $2, 'bag', 1)`,
          [guildId, uid],
        )).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }
    });

    it('0040 업/다운 적용 시 기존 공용 enhance_rank를 0으로 초기화하고 기본 rank·pool은 유지한다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const { guildId } = await setupGuildUser(other);
        await other.query(migration('0040_guild_member_enhancements.down.sql'));
        await other.query(
          `insert into public.guild_bonuses (guild_id, bonus, rank, enhance_rank, pool) values ($1, 'sell', 4, 3, 5000)`,
          [guildId],
        );
        await other.query(migration('0040_guild_member_enhancements.sql'));
        const { rows: [bonusRow] } = await other.query<{ rank: number; enhance_rank: number; pool: string }>(
          `select rank, enhance_rank, pool from public.guild_bonuses where guild_id = $1 and bonus = 'sell'`,
          [guildId],
        );
        expect({ rank: bonusRow.rank, enhanceRank: bonusRow.enhance_rank, pool: Number(bonusRow.pool) })
          .toEqual({ rank: 4, enhanceRank: 0, pool: 5000 });
        const { rows: [reg] } = await other.query<{ r: string | null }>(
          `select to_regclass('public.guild_member_enhancements')::text as r`,
        );
        expect(reg.r).toBe('guild_member_enhancements');
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('saves_current.guild_enhance_reset_count (0041)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');

    it('기본값 0과 0 이상 제약을 강제하고, 업/다운 적용으로 열이 추가·제거된다', async () => {
      const uid = randomUUID();
      await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [uid, `${uid}@example.test`]);
      const { rows: [row] } = await client.query<{ guild_enhance_reset_count: number }>(
        `insert into public.saves_current (user_id, data) values ($1, '{}'::jsonb) returning guild_enhance_reset_count`,
        [uid],
      );
      expect(row.guild_enhance_reset_count).toBe(0);
      await expect(client.query(
        `update public.saves_current set guild_enhance_reset_count = -1 where user_id = $1`,
        [uid],
      )).rejects.toMatchObject({ code: '23514' });

      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0041_guild_enhance_reset_count.down.sql'));
        const { rows: afterDown } = await other.query(
          `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'saves_current' and column_name = 'guild_enhance_reset_count'`,
        );
        expect(afterDown).toHaveLength(0);
        await other.query(migration('0041_guild_enhance_reset_count.sql'));
        const { rows: afterUp } = await other.query<{ is_nullable: string; column_default: string | null }>(
          `select is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'saves_current' and column_name = 'guild_enhance_reset_count'`,
        );
        expect(afterUp).toHaveLength(1);
        expect(afterUp[0].is_nullable).toBe('NO');
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('daily_fortunes (0042, 0046)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');
    const user = async (c: Client): Promise<string> => {
      const uid = randomUUID();
      await c.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [uid, `${uid}@example.test`]);
      return uid;
    };

    it('복합 PK·check 제약(kind, index)·기본 created_at·cascade 삭제를 강제한다', async () => {
      const uid = await user(client);
      const { rows: [inserted] } = await client.query<{ created_at: Date }>(
        `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, '2030-03-04', 'fish', 3)
         returning created_at`,
        [uid],
      );
      expect(inserted.created_at).toBeInstanceOf(Date);

      await expect(client.query(
        `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, '2030-03-04', 'gold', 5)`,
        [uid],
      )).rejects.toMatchObject({ code: '23505' });
      await expect(client.query(
        `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, '2030-03-05', 'luck', 3)`,
        [uid],
      )).rejects.toMatchObject({ code: '23514' });
      await expect(client.query(
        `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, '2030-03-05', 'gold', 4)`,
        [uid],
      )).rejects.toMatchObject({ code: '23514' });

      // 0046: 1·2등급 9종은 index 3·5 허용, 3등급 3종은 index 5만 허용(3 거부)
      let dayOffset = 10;
      for (const kind of ['fish', 'gold', 'bite', 'big', 'fame', 'shadow', 'mutation', 'night', 'energy']) {
        for (const index of [3, 5]) {
          const day = `2030-04-${String(dayOffset++).padStart(2, '0')}`;
          await client.query(
            `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, $2, $3, $4)`,
            [uid, day, kind, index],
          );
        }
      }
      for (const kind of ['golden-scale', 'mirage', 'grand-catch']) {
        const okDay = `2030-05-${String(dayOffset++).padStart(2, '0')}`;
        await client.query(
          `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, $2, $3, 5)`,
          [uid, okDay, kind],
        );
        const badDay = `2030-05-${String(dayOffset++).padStart(2, '0')}`;
        await expect(client.query(
          `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, $2, $3, 3)`,
          [uid, badDay, kind],
        )).rejects.toMatchObject({ code: '23514' });
      }

      await client.query(`delete from auth.users where id = $1`, [uid]);
      expect((await client.query(
        `select 1 from public.daily_fortunes where user_id = $1`, [uid],
      )).rows).toHaveLength(0);
    });

    it('0046 다운/업 마이그레이션 라운드트립이 제약과 행을 일관되게 전환한다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const uid = await user(other);
        await other.query(
          `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, '2030-03-04', 'mirage', 5)`,
          [uid],
        );
        await other.query(migration('0046_expand_daily_fortunes.down.sql'));
        await expect(other.query(
          `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, '2030-03-05', 'bite', 3)`,
          [uid],
        )).rejects.toMatchObject({ code: '23514' });
        await other.query(migration('0046_expand_daily_fortunes.sql'));
        await other.query(
          `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, '2030-03-05', 'bite', 3)`,
          [uid],
        );
      } finally {
        await other.end();
        await copy.drop();
      }
    });

    it('인증 사용자는 본인 운세 이력도 읽거나 쓰지 못한다 — 서버 전용', async () => {
      const uid = await user(client);
      await client.query(
        `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, '2030-03-04', 'shadow', 5)`,
        [uid],
      );
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
        expect((await client.query('select day from public.daily_fortunes')).rows).toEqual([]);
        await expect(client.query(
          `insert into public.daily_fortunes (user_id, day, kind, index) values ($1, '2030-03-05', 'fish', 3)`,
          [uid],
        )).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }
    });
  });

  describe('mails.items (0043)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');

    it('기본값 빈 배열([])과 NOT NULL을 강제하고, 업/다운 적용으로 열이 추가·제거된다', async () => {
      const uid = randomUUID();
      await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, true)`, [uid, `${uid}@anonymous.invalid`]);
      const { rows: [row] } = await client.query<{ items: unknown }>(
        `insert into public.mails (user_id, title, body) values ($1, '제목', '본문') returning items`,
        [uid],
      );
      expect(row.items).toEqual([]);

      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0043_mail_items.down.sql'));
        const { rows: afterDown } = await other.query(
          `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mails' and column_name = 'items'`,
        );
        expect(afterDown).toHaveLength(0);
        await other.query(migration('0043_mail_items.sql'));
        const { rows: afterUp } = await other.query<{ is_nullable: string; column_default: string | null }>(
          `select is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'mails' and column_name = 'items'`,
        );
        expect(afterUp).toHaveLength(1);
        expect(afterUp[0].is_nullable).toBe('NO');
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('daily_fortunes 중복 인덱스 제거 (0044)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');
    const indexesOf = async (c: Client) => (await c.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public' and tablename = 'daily_fortunes' order by indexname`,
    )).rows.map(r => r.indexname);

    it('기본 키 인덱스는 유지하고 중복 daily_fortunes_user_day_idx만 제거하며, 다운/업이 동작한다', async () => {
      expect(await indexesOf(client)).toEqual(['daily_fortunes_pkey']);

      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0044_drop_redundant_daily_fortunes_index.down.sql'));
        expect(await indexesOf(other)).toEqual(['daily_fortunes_pkey', 'daily_fortunes_user_day_idx']);
        await other.query(migration('0044_drop_redundant_daily_fortunes_index.sql'));
        expect(await indexesOf(other)).toEqual(['daily_fortunes_pkey']);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('http_metrics_daily (0045)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');

    it('기본 키·허용 경로 묶음·음수 금지·기본값·서버 전용 RLS·다운/업 라운드트립을 검증한다', async () => {
      const { rows: [inserted] } = await client.query<{ total: string; status_426: string; status_429: string; status_5xx: string }>(
        `insert into public.http_metrics_daily (day, route_group) values ('2030-03-04', 'action')
         returning total, status_426, status_429, status_5xx`,
      );
      expect(inserted).toEqual({ total: '0', status_426: '0', status_429: '0', status_5xx: '0' });

      // 중복 (day, route_group) 거부
      await expect(client.query(
        `insert into public.http_metrics_daily (day, route_group, total) values ('2030-03-04', 'action', 1)`,
      )).rejects.toMatchObject({ code: '23505' });

      // 허용되지 않은 route_group 거부
      await expect(client.query(
        `insert into public.http_metrics_daily (day, route_group, total) values ('2030-03-04', 'unknown', 1)`,
      )).rejects.toMatchObject({ code: '23514' });

      // 음수 카운트 거부
      await expect(client.query(
        `insert into public.http_metrics_daily (day, route_group, total) values ('2030-03-04', 'api', -1)`,
      )).rejects.toMatchObject({ code: '23514' });

      // 인증 사용자는 읽거나 쓰지 못한다 — 서버 전용 RLS
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        expect((await client.query('select day from public.http_metrics_daily')).rows).toEqual([]);
        await expect(client.query(
          `insert into public.http_metrics_daily (day, route_group, total) values ('2030-03-05', 'web', 1)`,
        )).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }

      // 다운/업 라운드트립
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0045_http_metrics.down.sql'));
        const { rows: afterDown } = await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'http_metrics_daily'`,
        );
        expect(afterDown).toHaveLength(0);
        await other.query(migration('0045_http_metrics.sql'));
        const { rows: afterUp } = await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'http_metrics_daily'`,
        );
        expect(afterUp).toHaveLength(1);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('mails.idempotency_key (0047)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');
    const user = async (c: Client): Promise<string> => {
      const uid = randomUUID();
      await c.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, true)`, [uid, `${uid}@anonymous.invalid`]);
      return uid;
    };

    it('NULL idempotency_key는 중복 허용하고 비NULL (user_id, idempotency_key)는 계정당 1건만 허용하며, 다운/업이 동작한다', async () => {
      const a = await user(client);
      const b = await user(client);
      await client.query(`insert into public.mails (user_id, title, body) values ($1, '일반1', 'b'), ($1, '일반2', 'b')`, [a]);
      await client.query(`insert into public.mails (user_id, idempotency_key, title, body) values ($1, 'welcome', '선물', 'b')`, [a]);
      await client.query(`insert into public.mails (user_id, idempotency_key, title, body) values ($1, 'welcome', '선물', 'b')`, [b]);
      await expect(client.query(
        `insert into public.mails (user_id, idempotency_key, title, body) values ($1, 'welcome', '중복', 'b')`,
        [a],
      )).rejects.toMatchObject({ code: '23505' });

      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0047_mail_idempotency_key.down.sql'));
        const { rows: afterDownCol } = await other.query(
          `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mails' and column_name = 'idempotency_key'`,
        );
        expect(afterDownCol).toHaveLength(0);
        const { rows: afterDownIdx } = await other.query(
          `select 1 from pg_indexes where schemaname = 'public' and tablename = 'mails' and indexname = 'mails_user_idempotency_idx'`,
        );
        expect(afterDownIdx).toHaveLength(0);

        await other.query(migration('0047_mail_idempotency_key.sql'));
        const { rows: afterUpCol } = await other.query<{ is_nullable: string }>(
          `select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'mails' and column_name = 'idempotency_key'`,
        );
        expect(afterUpCol).toEqual([{ is_nullable: 'YES' }]);
        const { rows: afterUpIdx } = await other.query(
          `select 1 from pg_indexes where schemaname = 'public' and tablename = 'mails' and indexname = 'mails_user_idempotency_idx'`,
        );
        expect(afterUpIdx).toHaveLength(1);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('chat_messages 채널·지역 확장 및 notices (0048)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');

    it('chat_messages 채널 제약·인덱스와 notices 제약·RLS 차단·다운/업 라운드트립을 검증한다', async () => {
      const uid = randomUUID();
      await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [uid, `${uid}@example.test`]);

      // chat_messages 채널 기본값('local') 및 허용값 제약
      const { rows: [chatRow] } = await client.query<{ channel: string; region: string | null }>(
        `insert into public.chat_messages (user_id, nick, text) values ($1, '낚시꾼', '기본') returning channel, region`,
        [uid],
      );
      expect(chatRow).toEqual({ channel: 'local', region: null });
      await expect(client.query(
        `insert into public.chat_messages (user_id, nick, text, channel) values ($1, '낚시꾼', '오류', 'dm')`,
        [uid],
      )).rejects.toMatchObject({ code: '23514' });

      // notices 제약(제목 1..80, 본문 1..600, ends_at > starts_at) 및 created_by on delete set null
      const { rows: [noticeRow] } = await client.query<{ id: string; created_at: Date; updated_at: Date }>(
        `insert into public.notices (title, body, starts_at, ends_at, created_by)
         values ('점검 안내', '서버 점검이 예정되어 있어요.', '2030-01-01T00:00:00Z', '2030-01-02T00:00:00Z', $1)
         returning id, created_at, updated_at`,
        [uid],
      );
      expect(noticeRow.created_at).toBeInstanceOf(Date);
      expect(noticeRow.updated_at).toBeInstanceOf(Date);

      await expect(client.query(
        `insert into public.notices (title, body, starts_at, ends_at) values ('', '본문', '2030-01-01T00:00:00Z', '2030-01-02T00:00:00Z')`,
      )).rejects.toMatchObject({ code: '23514' });
      await expect(client.query(
        `insert into public.notices (title, body, starts_at, ends_at) values ($1, '본문', '2030-01-01T00:00:00Z', '2030-01-02T00:00:00Z')`,
        ['가'.repeat(81)],
      )).rejects.toMatchObject({ code: '23514' });
      await expect(client.query(
        `insert into public.notices (title, body, starts_at, ends_at) values ('제목', $1, '2030-01-01T00:00:00Z', '2030-01-02T00:00:00Z')`,
        ['나'.repeat(601)],
      )).rejects.toMatchObject({ code: '23514' });
      await expect(client.query(
        `insert into public.notices (title, body, starts_at, ends_at) values ('제목', '본문', '2030-01-02T00:00:00Z', '2030-01-01T00:00:00Z')`,
      )).rejects.toMatchObject({ code: '23514' });

      // 인증 사용자는 공지를 읽거나 쓰지 못한다 — 서버 전용 RLS
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
        expect((await client.query('select id from public.notices')).rows).toEqual([]);
        await expect(client.query(
          `insert into public.notices (title, body, starts_at, ends_at) values ('차단', '본문', '2030-01-01T00:00:00Z', '2030-01-02T00:00:00Z')`,
        )).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }

      // 다운/업 라운드트립 및 기존 행 channel 백필 검증
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const u2 = randomUUID();
        await other.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [u2, `${u2}@example.test`]);
        const { rows: [g] } = await other.query<{ id: string }>(
          `insert into public.guilds (name, code) values ($1, upper(substr(md5(random()::text), 1, 8))) returning id`,
          [`g${u2.slice(0, 6)}`],
        );

        await other.query(migration('0048_chat_channels_and_notices.down.sql'));
        expect((await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notices'`,
        )).rows).toHaveLength(0);
        expect((await other.query(
          `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_messages' and column_name in ('channel', 'region')`,
        )).rows).toHaveLength(0);

        await other.query(`insert into public.chat_messages (user_id, nick, text, guild_id) values ($1, '가', '전체', null)`, [u2]);
        await other.query(`insert into public.chat_messages (user_id, nick, text, guild_id) values ($1, '가', '길드', $2)`, [u2, g.id]);

        await other.query(migration('0048_chat_channels_and_notices.sql'));
        expect((await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notices'`,
        )).rows).toHaveLength(1);
        const { rows: backfilled } = await other.query<{ text: string; channel: string; region: string | null }>(
          `select text, channel, region from public.chat_messages where user_id = $1 order by id`,
          [u2],
        );
        expect(backfilled).toEqual([
          { text: '전체', channel: 'global', region: null },
          { text: '길드', channel: 'guild', region: null },
        ]);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('ranking_weekly_fame (0050)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');
    const hasTable = async (c: Client) => (await c.query<{ r: string | null }>(
      `select to_regclass('public.ranking_weekly_fame')::text as r`,
    )).rows[0].r !== null;
    const hasIndex = async (c: Client, table: string, name: string) => (await c.query(
      `select 1 from pg_indexes where schemaname = 'public' and tablename = $1 and indexname = $2`,
      [table, name],
    )).rows.length === 1;

    it('복합 PK·fame_gained>=0 제약·cascade 삭제·서버 전용 RLS·다운/업 라운드트립을 검증한다', async () => {
      const uid = randomUUID();
      await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [uid, `${uid}@example.test`]);

      const { rows: [inserted] } = await client.query<{ fame_gained: string; reached_at: Date; updated_at: Date }>(
        `insert into public.ranking_weekly_fame (week_start, user_id) values ('2030-03-04', $1)
         returning fame_gained, reached_at, updated_at`,
        [uid],
      );
      expect(Number(inserted.fame_gained)).toBe(0);
      expect(inserted.reached_at).toBeInstanceOf(Date);
      expect(inserted.updated_at).toBeInstanceOf(Date);

      // 동일 (week_start, user_id) 중복 거부
      await expect(client.query(
        `insert into public.ranking_weekly_fame (week_start, user_id, fame_gained) values ('2030-03-04', $1, 10)`,
        [uid],
      )).rejects.toMatchObject({ code: '23505' });

      // 음수 fame_gained 거부
      await expect(client.query(
        `insert into public.ranking_weekly_fame (week_start, user_id, fame_gained) values ('2030-03-11', $1, -1)`,
        [uid],
      )).rejects.toMatchObject({ code: '23514' });

      // 인증 사용자는 본인 행도 읽거나 쓰지 못한다 — 서버 전용 RLS
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
        expect((await client.query('select week_start from public.ranking_weekly_fame')).rows).toEqual([]);
        await expect(client.query(
          `insert into public.ranking_weekly_fame (week_start, user_id, fame_gained) values ('2030-03-11', $1, 5)`,
          [uid],
        )).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }

      // auth.users 삭제 시 cascade 삭제
      await client.query(`delete from auth.users where id = $1`, [uid]);
      expect((await client.query(`select 1 from public.ranking_weekly_fame where user_id = $1`, [uid])).rows).toHaveLength(0);

      // 다운/업 라운드트립 및 두 인덱스 확인
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        expect(await hasTable(other)).toBe(true);
        expect(await hasIndex(other, 'ranking_weekly_fame', 'ranking_weekly_fame_board_idx')).toBe(true);
        expect(await hasIndex(other, 'bounty_clears', 'bounty_clears_kind_cleared_at_idx')).toBe(true);

        await other.query(migration('0050_ranking_weekly_fame.down.sql'));
        expect(await hasTable(other)).toBe(false);
        expect(await hasIndex(other, 'bounty_clears', 'bounty_clears_kind_cleared_at_idx')).toBe(false);

        await other.query(migration('0050_ranking_weekly_fame.sql'));
        expect(await hasTable(other)).toBe(true);
        expect(await hasIndex(other, 'ranking_weekly_fame', 'ranking_weekly_fame_board_idx')).toBe(true);
        expect(await hasIndex(other, 'bounty_clears', 'bounty_clears_kind_cleared_at_idx')).toBe(true);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('mails.hats (0051)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');

    it('hats 열 기본값은 빈 배열이고 배열을 저장할 수 있으며, 다운/업 라운드트립이 동작한다', async () => {
      const uid = randomUUID();
      await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, true)`, [uid, `${uid}@anonymous.invalid`]);
      const { rows: [defRow] } = await client.query<{ hats: unknown }>(
        `insert into public.mails (user_id, title, body) values ($1, '기본', '본문') returning hats`,
        [uid],
      );
      expect(defRow.hats).toEqual([]);

      const { rows: [hatRow] } = await client.query<{ hats: unknown }>(
        `insert into public.mails (user_id, title, body, hats) values ($1, '산타', '본문', '["santa-hat"]'::jsonb) returning hats`,
        [uid],
      );
      expect(hatRow.hats).toEqual(['santa-hat']);

      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0051_mail_hats.down.sql'));
        const { rows: afterDownCol } = await other.query(
          `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mails' and column_name = 'hats'`,
        );
        expect(afterDownCol).toHaveLength(0);

        await other.query(migration('0051_mail_hats.sql'));
        const { rows: afterUpCol } = await other.query<{ is_nullable: string }>(
          `select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'mails' and column_name = 'hats'`,
        );
        expect(afterUpCol).toEqual([{ is_nullable: 'NO' }]);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('widget_auth_codes · widget_tokens · saves_current.last_spot (0052)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');

    it('last_spot 널 허용, 위젯 코드·토큰 표 제약·연쇄 삭제·RLS 차단·다운/업 라운드트립을 검증한다', async () => {
      const uid = randomUUID();
      await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [uid, `${uid}@example.test`]);

      const { rows: [saveRow] } = await client.query<{ last_spot: string | null }>(
        `insert into public.saves_current (user_id, data) values ($1, '{}'::jsonb) returning last_spot`,
        [uid],
      );
      expect(saveRow.last_spot).toBeNull();

      const { rows: [codeRow] } = await client.query<{ created_at: Date }>(
        `insert into public.widget_auth_codes (code_hash, user_id, code_challenge, redirect_uri, expires_at)
         values ('hash-code-1', $1, 'challenge-1', 'http://127.0.0.1:4100/callback', '2099-01-01T00:00:00Z')
         returning created_at`,
        [uid],
      );
      expect(codeRow.created_at).toBeInstanceOf(Date);

      const { rows: [tokenRow] } = await client.query<{ created_at: Date; last_seen_at: Date }>(
        `insert into public.widget_tokens (token_hash, user_id, client_version, expires_at)
         values ('hash-token-1', $1, '0.1.0', '2099-01-01T00:00:00Z')
         returning created_at, last_seen_at`,
        [uid],
      );
      expect(tokenRow.created_at).toBeInstanceOf(Date);
      expect(tokenRow.last_seen_at).toBeInstanceOf(Date);

      // 인증 사용자는 위젯 코드·토큰 표를 읽거나 쓰지 못한다 — 서버 전용 RLS
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
        expect((await client.query('select code_hash from public.widget_auth_codes')).rows).toEqual([]);
        expect((await client.query('select token_hash from public.widget_tokens')).rows).toEqual([]);
        await expect(client.query(
          `insert into public.widget_tokens (token_hash, user_id, client_version, expires_at)
           values ('forged', $1, '0.1.0', '2099-01-01T00:00:00Z')`,
          [uid],
        )).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }

      // auth.users 삭제 시 연쇄 삭제
      await client.query(`delete from auth.users where id = $1`, [uid]);
      expect((await client.query(`select 1 from public.widget_auth_codes where user_id = $1`, [uid])).rows).toHaveLength(0);
      expect((await client.query(`select 1 from public.widget_tokens where user_id = $1`, [uid])).rows).toHaveLength(0);

      // 다운/업 라운드트립
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0052_desktop_widget.down.sql'));
        expect((await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name in ('widget_auth_codes', 'widget_tokens')`,
        )).rows).toHaveLength(0);
        expect((await other.query(
          `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'saves_current' and column_name = 'last_spot'`,
        )).rows).toHaveLength(0);

        await other.query(migration('0052_desktop_widget.sql'));
        expect((await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name in ('widget_auth_codes', 'widget_tokens')`,
        )).rows).toHaveLength(2);
        expect((await other.query(
          `select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'saves_current' and column_name = 'last_spot'`,
        )).rows).toEqual([{ is_nullable: 'YES' }]);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('admins 역할·배지 및 admin_audit_logs (0054)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');

    it('기본값·역할 제약·감사 로그 RLS·actor_id set null·다운/업 라운드트립을 검증한다', async () => {
      const uid = randomUUID();
      await client.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [uid, `${uid}@example.test`]);

      const { rows: [adminRow] } = await client.query<{ role: string; show_staff_badge: boolean }>(
        `insert into public.admins (user_id) values ($1) returning role, show_staff_badge`,
        [uid],
      );
      expect(adminRow).toEqual({ role: 'admin', show_staff_badge: false });

      await client.query(`update public.admins set role = 'maintainer', show_staff_badge = true where user_id = $1`, [uid]);
      await expect(client.query(`update public.admins set role = 'tester' where user_id = $1`, [uid]))
        .rejects.toMatchObject({ code: '23514' });

      const { rows: [logRow] } = await client.query<{ actor_id: string; actor_role: string; reason: string; detail: Record<string, unknown>; created_at: Date }>(
        `insert into public.admin_audit_logs (actor_id, actor_role, action) values ($1, 'maintainer', 'staffBadge')
         returning actor_id, actor_role, reason, detail, created_at`,
        [uid],
      );
      expect(logRow.actor_id).toBe(uid);
      expect(logRow.actor_role).toBe('maintainer');
      expect(logRow.reason).toBe('');
      expect(logRow.detail).toEqual({});
      expect(logRow.created_at).toBeInstanceOf(Date);

      await expect(client.query(
        `insert into public.admin_audit_logs (actor_id, actor_role, action) values ($1, 'guest', 'staffBadge')`,
        [uid],
      )).rejects.toMatchObject({ code: '23514' });

      // 인증 사용자는 감사 로그를 읽거나 쓰지 못한다 — 서버 전용 RLS
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
        expect((await client.query('select id from public.admin_audit_logs')).rows).toEqual([]);
        await expect(client.query(
          `insert into public.admin_audit_logs (actor_id, actor_role, action) values ($1, 'admin', 'forged')`,
          [uid],
        )).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }

      // 행위자 계정 삭제 시 감사 로그는 보존되고 actor_id만 null이 된다
      await client.query(`delete from auth.users where id = $1`, [uid]);
      const { rows: afterDelete } = await client.query<{ actor_id: string | null }>(
        `select actor_id from public.admin_audit_logs where action = 'staffBadge'`,
      );
      expect(afterDelete).toEqual([{ actor_id: null }]);

      // 다운/업 라운드트립
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0054_admin_roles_and_staff_badge.down.sql'));
        expect((await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'admin_audit_logs'`,
        )).rows).toHaveLength(0);
        expect((await other.query(
          `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'admins' and column_name in ('role', 'show_staff_badge')`,
        )).rows).toHaveLength(0);

        await other.query(migration('0054_admin_roles_and_staff_badge.sql'));
        expect((await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'admin_audit_logs'`,
        )).rows).toHaveLength(1);
        expect((await other.query(
          `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'admins' and column_name in ('role', 'show_staff_badge') order by column_name`,
        )).rows.map(r => r.column_name)).toEqual(['role', 'show_staff_badge']);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('서버 관측 지표 확장 (0055)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');

    it('http_metrics_daily 확장 열·음수 금지·ws_metrics_daily 서버 전용 RLS·다운/업 라운드트립을 검증한다', async () => {
      const { rows: [httpRow] } = await client.query<{ status_409: string; status_4xx: string; lat_le_50: string; lat_sum_ms: string; rl_other: string }>(
        `insert into public.http_metrics_daily (day, route_group) values ('2030-03-06', 'action')
         returning status_409, status_4xx, lat_le_50, lat_sum_ms, rl_other`,
      );
      expect(httpRow).toEqual({ status_409: '0', status_4xx: '0', lat_le_50: '0', lat_sum_ms: '0', rl_other: '0' });

      await expect(client.query(
        `insert into public.http_metrics_daily (day, route_group, lat_le_50) values ('2030-03-06', 'api', -1)`,
      )).rejects.toMatchObject({ code: '23514' });

      const { rows: [wsRow] } = await client.query<{ upgrades_ok: string; reject_500: string; close_idle_timeout: string }>(
        `insert into public.ws_metrics_daily (day) values ('2030-03-06')
         returning upgrades_ok, reject_500, close_idle_timeout`,
      );
      expect(wsRow).toEqual({ upgrades_ok: '0', reject_500: '0', close_idle_timeout: '0' });

      await expect(client.query(
        `insert into public.ws_metrics_daily (day, close_abnormal) values ('2030-03-07', -1)`,
      )).rejects.toMatchObject({ code: '23514' });

      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        expect((await client.query('select day from public.ws_metrics_daily')).rows).toEqual([]);
        await expect(client.query(
          `insert into public.ws_metrics_daily (day, upgrades_ok) values ('2030-03-08', 1)`,
        )).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }

      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0055_server_observability.down.sql'));
        expect((await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ws_metrics_daily'`,
        )).rows).toHaveLength(0);
        expect((await other.query(
          `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'http_metrics_daily' and column_name in ('status_409', 'lat_le_50', 'rl_other')`,
        )).rows).toHaveLength(0);

        await other.query(migration('0055_server_observability.sql'));
        expect((await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ws_metrics_daily'`,
        )).rows).toHaveLength(1);
        expect((await other.query(
          `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'http_metrics_daily' and column_name in ('status_409', 'lat_le_50', 'rl_other') order by column_name`,
        )).rows.map(r => r.column_name)).toEqual(['lat_le_50', 'rl_other', 'status_409']);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('클라이언트 체감 지표 (0056)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');

    it('client_metrics_daily 기본값·음수 금지·서버 전용 RLS·다운/업 라운드트립을 검증한다', async () => {
      const { rows: [row] } = await client.query<{
        reports: string; lcp_count: string; cls_sum_x1000: string;
        action_rtt_count: string; me_rtt_count: string; canvas_frames: string; ws_reconnects: string;
      }>(
        `insert into public.client_metrics_daily (day) values ('2030-03-06')
         returning reports, lcp_count, cls_sum_x1000, action_rtt_count, me_rtt_count, canvas_frames, ws_reconnects`,
      );
      expect(row).toEqual({
        reports: '0', lcp_count: '0', cls_sum_x1000: '0',
        action_rtt_count: '0', me_rtt_count: '0', canvas_frames: '0', ws_reconnects: '0',
      });

      await expect(client.query(
        `insert into public.client_metrics_daily (day, canvas_frames) values ('2030-03-07', -1)`,
      )).rejects.toMatchObject({ code: '23514' });

      await expect(client.query(
        `insert into public.client_metrics_daily (day, lcp_sum_ms) values ('2030-03-08', -5)`,
      )).rejects.toMatchObject({ code: '23514' });

      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        expect((await client.query('select day from public.client_metrics_daily')).rows).toEqual([]);
        await expect(client.query(
          `insert into public.client_metrics_daily (day, reports) values ('2030-03-09', 1)`,
        )).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.query('rollback');
      }

      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0056_client_metrics.down.sql'));
        expect((await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'client_metrics_daily'`,
        )).rows).toHaveLength(0);

        await other.query(migration('0056_client_metrics.sql'));
        expect((await other.query(
          `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'client_metrics_daily'`,
        )).rows).toHaveLength(1);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });
});
