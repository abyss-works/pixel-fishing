// 지원 코드와 납품 진행 행의 소비는 저장 확정이 성공할 때만 일어난다 — 실제 Postgres로 검사한다.
// 읽기와 확정 사이의 경합은 확정 함수 경계에서 대체한다. 호출 직전에 훅이 끼어들어 저장 버전을 올리거나
// 다른 요청을 끝까지 실행한다.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOUNTIES } from '../src/game/content/bounties.js';
import { callAction, captureRealClock, seedUser, seededRandom, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';

const hook: { beforeCommit: (() => Promise<void>) | null; failStatement: boolean } = { beforeCommit: null, failStatement: false };

vi.mock('./_data/commit.js', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  const wrapped = Object.fromEntries(Object.entries(actual).map(([name, fn]) => {
    if (!name.startsWith('commit') || typeof fn !== 'function') return [name, fn];
    return [name, async (...args: unknown[]) => {
      const run = hook.beforeCommit;
      hook.beforeCommit = null;
      if (run) await run();
      // 확정 문장이 실행 중에 오류로 끝나는 경우 — 소비 뒤에 확정이 던진다
      if (hook.failStatement && name === 'commitConsumingCode') {
        hook.failStatement = false;
        args = [args[0], args[1], sql`update public.no_such_table set x = 1 returning x`, args[3]];
      }
      return (fn as (...a: unknown[]) => unknown)(...args);
    }];
  }));
  return wrapped;
});

const NOW = '2030-03-04T05:06:07.000Z';
let env: ActionEnv;
let nextUid = 1601;

beforeAll(async () => {
  env = await startActionEnv();
});
afterAll(async () => {
  await env?.stop();
});
beforeEach(() => {
  captureRealClock(() => performance.timeOrigin + performance.now());
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
  hook.beforeCommit = null;
  hook.failStatement = false;
  return () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  };
});

async function seed(opts: SeedOptions = {}): Promise<string> {
  const uid = testUid(nextUid++);
  return seedUser(env.client, { uid, email: `consume-${nextUid}@example.test`, state: {}, ...opts });
}

const bumpVersion = (uid: string) =>
  env.client.query('update public.saves_current set version = version + 1 where user_id = $1', [uid]).then(() => undefined);

const goldOf = async (uid: string) =>
  Number((await env.client.query<{ gold: string }>('select gold from public.saves_current where user_id = $1', [uid])).rows[0].gold);
const versionOf = async (uid: string) =>
  Number((await env.client.query<{ version: string }>('select version from public.saves_current where user_id = $1', [uid])).rows[0].version);
const rows = async (sqlText: string, args: unknown[]) => (await env.client.query(sqlText, args)).rows;

const RELIEF_GOLD = 5000;
async function insertRelief(code: string) {
  await env.client.query(`insert into public.reliefs (code, gold, fame, rod, boat, dex) values ($1, $2, 100, 0, 0, '{}')`, [code, RELIEF_GOLD]);
}
const reliefRow = async (code: string) =>
  (await rows('select active, claimed_by from public.reliefs where code = $1', [code]))[0] as { active: boolean; claimed_by: string | null };

const quest = BOUNTIES.find(b => b.zone === 'pacific' && b.difficulty === 'easy')!;
async function insertProgress(uid: string, progress: number) {
  await env.client.query(
    'insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, $4, $5)',
    [uid, quest.zone, quest.id, progress, NOW]);
}
const progressRows = (uid: string) => rows('select quest_id from public.bounty_progress where user_id = $1', [uid]);
const clearRows = (uid: string) => rows('select quest_id from public.bounty_clears where user_id = $1', [uid]);

const claim = (uid: string, code: string) => callAction(userToken(uid), { type: 'claimRelief', code });
const deliver = (uid: string) => callAction(userToken(uid), { type: 'deliverBounty', questId: quest.id });

describe('버전 충돌 응답', () => {
  it('재화가 걸린 일반 액션은 읽은 뒤 저장 버전이 오르면 409 version-conflict이고 아무것도 쓰지 않는다', async () => {
    const uid = await seed({ state: { gold: 100_000, rod: 0 } });
    hook.beforeCommit = () => bumpVersion(uid);
    const res = await callAction(userToken(uid), { type: 'upgradeRod' });
    expect(res).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
    expect(await goldOf(uid)).toBe(100_000);
    expect(await versionOf(uid)).toBe(3);
    const rod = await rows('select rod from public.saves_current where user_id = $1', [uid]);
    expect(rod[0].rod).toBe(0);
  });
});

describe('지원 코드 받기', () => {
  it('확정이 버전 충돌로 끝나면 코드는 쓰이지 않고, 같은 요청을 다시 보내면 지급된다', async () => {
    await insertRelief('CONSUME-1');
    const uid = await seed();
    hook.beforeCommit = () => bumpVersion(uid);
    expect(await claim(uid, 'CONSUME-1')).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
    expect(await reliefRow('CONSUME-1')).toEqual({ active: true, claimed_by: null });
    expect(await goldOf(uid)).toBe(0);

    const retry = await claim(uid, 'CONSUME-1');
    expect(retry.status).toBe(200);
    expect(await reliefRow('CONSUME-1')).toEqual({ active: false, claimed_by: uid });
    expect(await goldOf(uid)).toBe(RELIEF_GOLD);
  });

  it('확정 문장이 오류로 끝나면 500이고 소비가 되돌려져 코드를 다시 쓸 수 있다', async () => {
    await insertRelief('CONSUME-5');
    const uid = await seed();
    hook.failStatement = true;
    expect((await claim(uid, 'CONSUME-5')).status).toBe(500);
    expect(await reliefRow('CONSUME-5')).toEqual({ active: true, claimed_by: null });
    expect(await goldOf(uid)).toBe(0);
    expect(await versionOf(uid)).toBe(2);

    await env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z' where user_id = $1`, [uid]);
    expect((await claim(uid, 'CONSUME-5')).status).toBe(200);
    expect(await reliefRow('CONSUME-5')).toEqual({ active: false, claimed_by: uid });
    expect(await goldOf(uid)).toBe(RELIEF_GOLD);
  });

  it('두 계정이 같은 코드를 쓰려 하면 한 번만 지급되고 늦은 요청은 relief-invalid다', async () => {
    await insertRelief('CONSUME-2');
    const first = await seed();
    const second = await seed();
    let other: Awaited<ReturnType<typeof claim>> | null = null;
    // 첫 요청이 코드를 읽은 뒤 확정하기 전에 두 번째 요청이 끝까지 실행된다
    hook.beforeCommit = async () => { other = await claim(second, 'CONSUME-2'); };
    const late = await claim(first, 'CONSUME-2');
    expect(other).toMatchObject({ status: 200 });
    expect(late).toMatchObject({ status: 422, body: { error: 'relief-invalid' } });
    expect(await goldOf(second)).toBe(RELIEF_GOLD);
    expect(await goldOf(first)).toBe(0);
    expect(await versionOf(first)).toBe(2);
    expect(await reliefRow('CONSUME-2')).toEqual({ active: false, claimed_by: second });
  });

  it('두 계정이 같은 코드를 동시에 보내도 한 번만 지급된다', async () => {
    await insertRelief('CONSUME-3');
    const a = await seed();
    const b = await seed();
    const results = await Promise.all([claim(a, 'CONSUME-3'), claim(b, 'CONSUME-3')]);
    expect(results.map(r => r.status).sort()).toEqual([200, 422]);
    expect((await goldOf(a)) + (await goldOf(b))).toBe(RELIEF_GOLD);
  });

  it('이미 쓴 코드와 없는 코드는 거부하고 아무 표도 바꾸지 않는다', async () => {
    await env.client.query(`insert into public.reliefs (code, gold, claimed_by, active) values ('CONSUME-USED', 700, $1, false)`,
      [await seed()]);
    const uid = await seed();
    for (const code of ['CONSUME-USED', 'CONSUME-NONE']) {
      expect(await claim(uid, code)).toMatchObject({ status: 422, body: { error: 'relief-invalid' } });
    }
    expect(await goldOf(uid)).toBe(0);
    expect(await versionOf(uid)).toBe(2);
    expect((await reliefRow('CONSUME-USED')).active).toBe(false);
    expect(await rows('select code from public.reliefs where code = $1', ['CONSUME-NONE'])).toEqual([]);
  });
});

describe('납품', () => {
  it('확정이 버전 충돌로 끝나면 진행 행이 남고, 다시 보내면 클리어 기록과 보상이 남는다', async () => {
    const uid = await seed();
    await insertProgress(uid, quest.count);
    hook.beforeCommit = () => bumpVersion(uid);
    expect(await deliver(uid)).toMatchObject({ status: 409, body: { error: 'version-conflict' } });
    expect(await progressRows(uid)).toHaveLength(1);
    expect(await clearRows(uid)).toEqual([]);
    expect(await goldOf(uid)).toBe(0);

    expect((await deliver(uid)).status).toBe(200);
    expect(await progressRows(uid)).toEqual([]);
    expect(await clearRows(uid)).toHaveLength(1);
    expect(await goldOf(uid)).toBe(quest.reward);
  });

  it('같은 납품을 다시 보내면 한 번만 처리된다', async () => {
    const uid = await seed();
    await insertProgress(uid, quest.count);
    expect((await deliver(uid)).status).toBe(200);
    await env.client.query(`update public.saves_current set updated_at = '2026-01-01T00:00:00Z' where user_id = $1`, [uid]);
    expect(await deliver(uid)).toMatchObject({ status: 422, body: { error: 'quest-incomplete' } });
    expect(await clearRows(uid)).toHaveLength(1);
    expect(await goldOf(uid)).toBe(quest.reward);
  });

  it('첫 요청이 확정하기 전에 같은 납품이 끝나 있으면 늦은 요청은 거부되고 지급은 한 번이다', async () => {
    const uid = await seed();
    await insertProgress(uid, quest.count);
    let other: Awaited<ReturnType<typeof deliver>> | null = null;
    hook.beforeCommit = async () => { other = await deliver(uid); };
    const late = await deliver(uid);
    expect(other).toMatchObject({ status: 200 });
    expect(late).toMatchObject({ status: 422, body: { error: 'quest-incomplete' } });
    expect(await clearRows(uid)).toHaveLength(1);
    expect(await goldOf(uid)).toBe(quest.reward);
  });

  it('진행이 덜 된 납품은 거부하고 진행 행과 다른 표를 바꾸지 않는다', async () => {
    const uid = await seed();
    await insertProgress(uid, 0);
    expect(await deliver(uid)).toMatchObject({ status: 422, body: { error: 'quest-incomplete' } });
    expect(await progressRows(uid)).toHaveLength(1);
    expect(await clearRows(uid)).toEqual([]);
    expect(await goldOf(uid)).toBe(0);
    expect(await versionOf(uid)).toBe(2);
  });

  it('진행 행이 없는 납품은 거부한다', async () => {
    const uid = await seed();
    expect(await deliver(uid)).toMatchObject({ status: 422, body: { error: 'quest-incomplete' } });
    expect(await clearRows(uid)).toEqual([]);
  });
});
