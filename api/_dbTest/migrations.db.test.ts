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
      'bounty_clears', 'mails', 'v_bounty_funnel_daily']) {
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

    it('되돌리기 SQL은 이 표만 지우고 다른 수배 표는 남긴다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const down = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '0018_bounty_clears.down.sql'), 'utf8');
        await other.query(down);
        const { rows } = await other.query<{ name: string }>(
          `select table_name as name from information_schema.tables where table_schema = 'public' and table_name like 'bounty%'`);
        expect(rows.map(r => r.name).sort()).toEqual(['bounty_accepts', 'bounty_licenses', 'bounty_progress', 'bounty_tickets']);
      } finally {
        await other.end();
        await copy.drop();
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

    it('되돌리기 SQL은 우편 표만 지운다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const down = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '0019_mails.down.sql'), 'utf8');
        await other.query(down);
        const { rows } = await other.query<{ name: string }>(
          `select table_name as name from information_schema.tables where table_schema = 'public' and table_name in ('mails', 'letters')`);
        expect(rows.map(r => r.name)).toEqual(['letters']);
      } finally {
        await other.end();
        await copy.drop();
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

    it('되돌리기 SQL은 두 열만 지운다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const down = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '0020_catch_pacing_session.down.sql'), 'utf8');
        await other.query(down);
        expect(await columns(other)).toEqual([]);
        const { rows } = await other.query<{ n: string }>(
          `select count(*) as n from information_schema.columns
           where table_schema = 'public' and table_name = 'saves_current' and column_name in ('version', 'updated_at')`);
        expect(Number(rows[0].n)).toBe(2);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });
  describe('편지 처리 시각 (0022)', () => {
    const column = async (c: Client): Promise<{ nullable: string }[]> => (await c.query<{ nullable: string }>(
      `select is_nullable as nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'letters' and column_name = 'handled_at'`)).rows;

    it('처리 시각 열이 비어 있는 값을 허용하는 채로 있다', async () => {
      expect(await column(client)).toEqual([{ nullable: 'YES' }]);
    });

    it('되돌리기 SQL은 처리 시각 열만 지운다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const down = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '0022_letters_handled.down.sql'), 'utf8');
        await other.query(down);
        expect(await column(other)).toEqual([]);
        expect((await other.query('select * from public.v_admin_letters')).rows).toEqual([]);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('채팅 메시지·신고 (0024)', () => {
    it('되돌리기 SQL은 채팅 표 둘만 지운다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const tables = async (c: Client) => (await c.query<{ name: string }>(
          `select table_name as name from information_schema.tables where table_schema = 'public'
           and table_name in ('chat_messages', 'chat_reports', 'blocks') order by table_name`)).rows.map(r => r.name);
        expect(await tables(other)).toEqual(['blocks', 'chat_messages', 'chat_reports']);
        const down = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '0024_chat.down.sql'), 'utf8');
        await other.query(down);
        expect(await tables(other)).toEqual(['blocks']);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('접속 세션·활동일·일별 집계 (0026)', () => {
    const tables = async (c: Client) => (await c.query<{ name: string }>(
      `select table_name as name from information_schema.tables where table_schema = 'public'
       and table_name in ('play_sessions', 'user_active_days', 'daily_stats', 'events') order by table_name`)).rows.map(r => r.name);

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

    it('되돌리기 SQL은 세 표만 지운다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        expect(await tables(other)).toEqual(['daily_stats', 'events', 'play_sessions', 'user_active_days']);
        const down = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '0026_activity.down.sql'), 'utf8');
        await other.query(down);
        expect(await tables(other)).toEqual(['events']);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('길드·길드 채팅 (0027)', () => {
    it('되돌리기 SQL은 길드 표 셋과 채팅의 길드 열만 지우고, 길드 채팅 메시지는 함께 지운다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const tables = async () => (await other.query<{ name: string }>(
          `select table_name as name from information_schema.tables where table_schema = 'public'
           and table_name in ('guilds', 'guild_members', 'guild_invites', 'chat_messages') order by table_name`)).rows.map(r => r.name);
        expect(await tables()).toEqual(['chat_messages', 'guild_members', 'guilds']);
        const uid = randomUUID();
        await other.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [uid, `${uid}@test.dev`]);
        const { rows: [g] } = await other.query<{ id: string }>(`insert into public.guilds (name, code) values ('심해', 'ABCDEFGH') returning id`);
        await other.query(`insert into public.chat_messages (user_id, nick, text) values ($1, 'n', '월드')`, [uid]);
        await other.query(`insert into public.chat_messages (user_id, nick, text, guild_id) values ($1, 'n', '길드', $2)`, [uid, g.id]);
        // 되돌리기는 최신부터 — 0028·0029·0031이 길드 표를 참조한다
        for (const file of ['0032_guild_rename.down.sql', '0031_guild_join.down.sql', '0029_guild_bonus.down.sql', '0028_guild_growth.down.sql', '0027_guilds.down.sql']) {
          await other.query(readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8'));
        }
        expect(await tables()).toEqual(['chat_messages']);
        expect((await other.query('select text from public.chat_messages')).rows).toEqual([{ text: '월드' }]);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('길드 성장·항해일지 (0028)', () => {
    it('되돌리기 SQL은 기여와 항해일지 표만 지운다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const tables = async () => (await other.query<{ name: string }>(
          `select table_name as name from information_schema.tables where table_schema = 'public'
           and table_name like 'guild%' order by table_name`)).rows.map(r => r.name);
        for (const file of ['0032_guild_rename.down.sql', '0031_guild_join.down.sql', '0029_guild_bonus.down.sql', '0028_guild_growth.down.sql']) {
          await other.query(readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8'));
        }
        expect(await tables()).toEqual(['guild_invites', 'guild_members', 'guilds']);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('길드 보너스 (0029)', () => {
    it('되돌리기 SQL은 보너스 표 둘과 기부·단계 상승 기록만 지우고 항해일지 종류를 0028로 되돌린다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const tables = async () => (await other.query<{ name: string }>(
          `select table_name as name from information_schema.tables where table_schema = 'public'
           and table_name like 'guild%' order by table_name`)).rows.map(r => r.name);
        expect(await tables()).toEqual(['guild_bonus_donations', 'guild_bonuses', 'guild_contributions', 'guild_join_requests',
          'guild_logs', 'guild_members', 'guilds']);
        const uid = randomUUID();
        await other.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [uid, `${uid}@test.dev`]);
        const { rows: [g] } = await other.query<{ id: string }>(`insert into public.guilds (name, code) values ('심해', 'ABCDEFGH') returning id`);
        await other.query(`insert into public.guild_logs (guild_id, user_id, kind) values ($1, $2, 'join')`, [g.id, uid]);
        await other.query(`insert into public.guild_logs (guild_id, user_id, kind, detail, value) values ($1, $2, 'donate', 'sell', 100)`, [g.id, uid]);
        for (const file of ['0032_guild_rename.down.sql', '0031_guild_join.down.sql', '0029_guild_bonus.down.sql']) {
          await other.query(readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8'));
        }
        expect(await tables()).toEqual(['guild_contributions', 'guild_invites', 'guild_logs', 'guild_members', 'guilds']);
        expect((await other.query('select kind from public.guild_logs')).rows).toEqual([{ kind: 'join' }]);
        await expect(other.query(`insert into public.guild_logs (guild_id, user_id, kind) values ($1, $2, 'donate')`, [g.id, uid]))
          .rejects.toThrow();
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('길드 가입 방식 (0031)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');

    it('쓰던 초대 코드가 있으면 고유 코드로 옮기고, 없으면 새 코드를 만들며, 되돌리면 초대 코드 표를 다시 만든다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0032_guild_rename.down.sql'));
        await other.query(migration('0031_guild_join.down.sql'));
        const { rows: [a] } = await other.query<{ id: string }>(`insert into public.guilds (name) values ('심해') returning id`);
        const { rows: [b] } = await other.query<{ id: string }>(`insert into public.guilds (name) values ('먼바다') returning id`);
        await other.query(`insert into public.guild_invites (guild_id, code, expires_at) values ($1, 'K7QX2MAB', now())`, [a.id]);
        await other.query(migration('0031_guild_join.sql'));
        const codes = (await other.query<{ id: string; code: string; join_mode: string }>('select id, code, join_mode from public.guilds')).rows;
        expect(codes.find(r => r.id === a.id)?.code).toBe('K7QX2MAB');
        expect(codes.find(r => r.id === b.id)?.code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
        expect(codes.every(r => r.join_mode === 'approval')).toBe(true);
        await expect(other.query(`insert into public.guilds (name) values ('코드없음')`)).rejects.toThrow();
        await other.query(migration('0031_guild_join.down.sql'));
        const cols = (await other.query<{ c: string }>(`select column_name as c from information_schema.columns
          where table_schema = 'public' and table_name = 'guilds' order by column_name`)).rows.map(r => r.c);
        expect(cols).toEqual(['created_at', 'id', 'name']);
        const tables = (await other.query<{ t: string }>(`select table_name as t from information_schema.tables
          where table_schema = 'public' and table_name in ('guild_invites', 'guild_join_requests')`)).rows.map(r => r.t);
        expect(tables).toEqual(['guild_invites']);
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('길드 이름 바꾸기 (0032)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');

    it('길드에 마지막 이름 변경 시각 열을 더하고, 되돌리면 열과 이름 바꾸기 기록을 지우고 항해일지 종류를 0029로 되돌린다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const uid = randomUUID();
        await other.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, false)`, [uid, `${uid}@test.dev`]);
        const { rows: [g] } = await other.query<{ id: string; renamed_at: string | null }>(
          `insert into public.guilds (name, code) values ('심해', 'ABCDEFGH') returning id, renamed_at`);
        expect(g.renamed_at).toBeNull();
        await other.query(`insert into public.guild_logs (guild_id, user_id, kind) values ($1, $2, 'join')`, [g.id, uid]);
        await other.query(`insert into public.guild_logs (guild_id, user_id, kind, detail) values ($1, $2, 'rename', '먼바다')`, [g.id, uid]);
        await other.query(migration('0032_guild_rename.down.sql'));
        const cols = (await other.query<{ c: string }>(`select column_name as c from information_schema.columns
          where table_schema = 'public' and table_name = 'guilds' and column_name = 'renamed_at'`)).rows;
        expect(cols).toEqual([]);
        expect((await other.query('select kind from public.guild_logs')).rows).toEqual([{ kind: 'join' }]);
        await expect(other.query(`insert into public.guild_logs (guild_id, user_id, kind) values ($1, $2, 'rename')`, [g.id, uid]))
          .rejects.toThrow();
        await other.query(migration('0032_guild_rename.sql'));
        await other.query(`insert into public.guild_logs (guild_id, user_id, kind, detail) values ($1, $2, 'rename', '먼바다')`, [g.id, uid]);
      } finally {
        await other.end();
        await copy.drop();
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

    it('0035.down, 0021.down 순으로 내렸다가 0021, 0035를 다시 올리는 왕복이 된다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        await other.query(migration('0035_drop_supabase_users.down.sql'));
        expect(await exists(other)).toBe(true);
        await other.query(migration('0021_better_auth.down.sql'));
        const legacy = await other.query(`select to_regclass('auth.supabase_users')::text as r, to_regclass('auth.sessions')::text as s`);
        expect(legacy.rows[0]).toEqual({ r: null, s: null });
        await other.query(migration('0021_better_auth.sql'));
        await other.query(migration('0035_drop_supabase_users.sql'));
        expect(await exists(other)).toBe(false);
        const uid = randomUUID();
        await other.query(`insert into auth.users (id, email, is_anonymous) values ($1, $2, true)`, [uid, `${uid}@anonymous.invalid`]);
        await other.query('select 1 from public.v_admin_users');
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });

  describe('consent_records (0036)', () => {
    const migration = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', file), 'utf8');
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

    it('0036.down으로 내렸다가 0036을 다시 올리는 왕복이 되고 다른 표는 남는다', async () => {
      const copy = await createTestDatabase();
      const other = new Client({ connectionString: copy.url });
      await other.connect();
      try {
        const uid = await user(other);
        await insert(other, uid, 'terms', '2030-01-01');
        await other.query(migration('0036_consent_records.down.sql'));
        const gone = await other.query(`select to_regclass('public.consent_records')::text as t, to_regclass('public.last_positions')::text as p`);
        expect(gone.rows[0]).toEqual({ t: null, p: 'last_positions' });
        await other.query(migration('0036_consent_records.sql'));
        expect((await other.query('select 1 from public.consent_records')).rows).toHaveLength(0);
        await insert(other, uid, 'terms', '2030-01-01');
        await other.query(migration('0036_consent_records.down.sql'));
        // 되돌리기는 표가 이미 없어도 실패하지 않는다
        await other.query(migration('0036_consent_records.down.sql'));
      } finally {
        await other.end();
        await copy.drop();
      }
    });
  });
});
