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
});
