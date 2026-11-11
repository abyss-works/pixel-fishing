// 가방 초과 방생 후보 — 실제 Postgres의 빠른 경로가 리듀서(overflowUids, pickEvict)와 같은 개체를 고르는지 검사한다.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { createTestDatabase } from '../_dbTest/testDatabase.js';
import type { TestDatabase } from '../_dbTest/testDatabase.js';
import { evictionCandidates } from './load.js';
import { evictionPriceRows, FISH, overflowUids, pickEvict, RARITY_ORDER } from '../../src/game/rules/logic.js';
import type { FishInstance } from '../../src/game/rules/logic.js';

let testDb: TestDatabase;
let client: Client;
let database: Database;

beforeAll(async () => {
  testDb = await createTestDatabase();
  client = new Client({ connectionString: testDb.url });
  await client.connect();
  database = createDatabase({ connectionString: testDb.url, max: 2 });
});
afterAll(async () => {
  await database?.pool.end();
  await client?.end();
  await testDb?.drop();
});

async function user(): Promise<string> {
  const uid = randomUUID();
  await client.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, false)', [uid, `${uid}@test.dev`]);
  await client.query('insert into public.profiles (user_id, nickname) values ($1, $2)', [uid, `e${uid.slice(0, 8)}`]);
  return uid;
}

const inst = (fishId: string, form: 'normal' | 'variant', size: number | null, locked = false): FishInstance => ({
  uid: randomUUID(), fishId, form, size, caughtAt: null, spot: null, judgment: null, locked,
});

async function seed(userId: string, bag: readonly FishInstance[]): Promise<void> {
  for (const i of bag) {
    await client.query(
      'insert into public.fish_instances (uid, user_id, fish_id, form, size, slot, locked) values ($1, $2, $3, $4, $5, null, $6)',
      [i.uid, userId, i.fishId, i.form, i.size, i.locked]);
  }
}

const known = FISH.map(f => f.id);
const groups = RARITY_ORDER.map(r => FISH.filter(f => f.rarity === r).map(f => f.id));
const prices = evictionPriceRows();

/** 빠른 경로의 선택 — action 처리와 같은 조합 */
async function fastPick(userId: string, incoming: FishInstance): Promise<string> {
  const rows = await evictionCandidates(database.db, userId, known, groups, prices);
  const tops = rows.map(t => t ? {
    uid: t.uid, fishId: t.fish_id, form: t.form as FishInstance['form'],
    size: t.size, caughtAt: null, spot: null, judgment: null, locked: false,
  } : null);
  const pick = pickEvict(tops, incoming);
  return pick.evictUid ?? incoming.uid;
}

/** 리듀서의 선택 — 새 개체를 더한 가방에서 하나 넘칠 때 놓아줄 개체 */
const reducerPick = (bag: readonly FishInstance[], incoming: FishInstance): string => {
  const full = [...bag, incoming];
  return overflowUids(full, full.length - 1)[0];
};

describe('evictionCandidates', () => {
  it('꽉 찬 가방에서 빠른 경로가 리듀서와 같은 개체를 고른다', async () => {
    const byRarity = RARITY_ORDER.map(r => FISH.filter(f => f.rarity === r));
    const lowest = byRarity.find(l => l.length > 0)!;
    expect(lowest.length).toBeGreaterThanOrEqual(2);
    const [cheap, dear] = [...lowest].sort((a, b) => a.price - b.price);
    const bag: FishInstance[] = [];
    // 변이 개체, 같은 등급의 서로 다른 판매가, 같은 판매가의 크기 차이와 크기 미상, 잠금
    FISH.forEach((f, n) => {
      bag.push(inst(f.id, 'normal', (n * 37) % 90 + 20), inst(f.id, 'variant', (n * 53) % 90 + 20));
    });
    bag.push(inst(cheap.id, 'normal', 10), inst(cheap.id, 'normal', 20), inst(dear.id, 'normal', null));
    bag.push(inst(dear.id, 'normal', 2), inst(cheap.id, 'variant', 80), inst(dear.id, 'variant', 5), inst(cheap.id, 'normal', 1, true));
    const userId = await user();
    await seed(userId, bag);

    const incomings = [
      inst(dear.id, 'variant', 100), inst(cheap.id, 'normal', 0.5), inst(cheap.id, 'normal', 10),
      inst(FISH[0].id, 'normal', 40), inst(FISH[FISH.length - 1].id, 'variant', 40),
    ];
    for (const incoming of incomings) {
      expect(await fastPick(userId, incoming)).toBe(reducerPick(bag, incoming));
    }
  });

  it('삭제 어종을 가장 먼저 고르고, 지우면 다음 순서로 넘어간다', async () => {
    const bag = [inst('deleted-fish', 'normal', 50), inst(FISH[0].id, 'normal', 30), inst(FISH[1].id, 'variant', 30)];
    const userId = await user();
    await seed(userId, bag);
    const incoming = inst(FISH[2].id, 'normal', 30);
    expect(await fastPick(userId, incoming)).toBe(bag[0].uid);
    expect(await fastPick(userId, incoming)).toBe(reducerPick(bag, incoming));
  });

  it('같은 판매가에서 uid가 작은 개체를 고른다', async () => {
    const f = FISH[0];
    const bag = [inst(f.id, 'normal', 12), inst(f.id, 'normal', 12), inst(f.id, 'normal', 12)];
    const userId = await user();
    await seed(userId, bag);
    const incoming = inst(f.id, 'variant', 99);
    expect(await fastPick(userId, incoming)).toBe(reducerPick(bag, incoming));
  });

  it('전부 잠기면 후보가 없다', async () => {
    const userId = await user();
    await seed(userId, [inst(FISH[0].id, 'normal', 1, true)]);
    const rows = await evictionCandidates(database.db, userId, known, groups, prices);
    expect(rows.every(r => r === null)).toBe(true);
  });

  it('수천 마리 가방에서 실행 계획이 가방 인덱스를 쓴다', async () => {
    const userId = await user();
    const other = await user();
    const bulk = (u: string, n: number) => client.query(
      `insert into public.fish_instances (uid, user_id, fish_id, form, size, slot, locked)
       select gen_random_uuid(), $1, f.id, case when g % 7 = 0 then 'variant' else 'normal' end, (g % 100)::real, null, false
       from generate_series(1, $2) g, (select unnest($3::text[]) as id) f where g % 1 = 0`,
      [u, n, known]);
    await bulk(userId, 400); // 어종 수만큼 곱해 수만 행
    await bulk(other, 400);
    await client.query('analyze public.fish_instances');
    const count = Number((await client.query('select count(*) from public.fish_instances where user_id = $1', [userId])).rows[0].count);
    expect(count).toBeGreaterThanOrEqual(2000);
    const plan = await database.db.execute<{ 'QUERY PLAN': string }>(sql`explain
      select i.uid from public.fish_instances i
      left join json_to_recordset(${JSON.stringify(prices.map(p => ({ fish_id: p.fishId, form: p.form, price: p.price })))}::json)
        as p(fish_id text, form text, price double precision) on p.fish_id = i.fish_id and p.form = i.form
      where i.user_id = ${userId} and i.slot is null and i.locked = false and i.fish_id = any(${sql.raw(`array[${groups[0].map(id => `'${id}'`).join(',')}]::text[]`)})
      order by coalesce(p.price, 0) asc, i.size asc nulls first, i.uid asc limit 1`);
    const text = plan.rows.map(r => r['QUERY PLAN']).join('\n');
    expect(text).toMatch(/fish_instances_bag_idx/);
  });
});
