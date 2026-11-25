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
      'bounty_clears', 'mails', 'daily_fortunes', 'v_bounty_funnel_daily']) {
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

  describe('daily_fortunes (0042)', () => {
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

      await client.query(`delete from auth.users where id = $1`, [uid]);
      expect((await client.query(
        `select 1 from public.daily_fortunes where user_id = $1`, [uid],
      )).rows).toHaveLength(0);
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
});
