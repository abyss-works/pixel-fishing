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
      'bounty_clears', 'v_bounty_funnel_daily']) {
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
      await client.query('insert into auth.users (id, email, is_anonymous) values ($1, null, true)', [uid]);
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
});
