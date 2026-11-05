// 액션 경로의 길드 성장 — 실제 Postgres에서 기여 기록(하루 상한·게임 날짜·의뢰 클리어), 항해일지와
// 길드 레벨이 천장·의뢰 보상을 바꾸지 않음을 검사한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOUNTIES } from '../src/game/content/bounties.js';
import { RARITY } from '../src/game/rules/logic.js';
import { SPECIES_PITY_K } from '../src/game/rules/pity.js';
import { callAction, captureRealClock, seedUser, seededRandom, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';

const NOW = '2030-03-04T05:06:07.000Z'; // KST 14:06 — 게임 날짜 2030-03-04
const TODAY = '2030-03-04';
const YESTERDAY = '2030-03-03';
let env: ActionEnv;
let nextUid = 1201;

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
  return () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  };
});

/** 길드 하나에 든 계정. total을 주면 다른 길드원이 그만큼 쌓아 둔 것으로 시작한다 */
async function member(opts: SeedOptions = {}, total = 0): Promise<{ uid: string; guild: string }> {
  const uid = await seedUser(env.client, { uid: testUid(nextUid++), email: `g${nextUid}@test.dev`, state: {}, ...opts });
  const { rows: [g] } = await env.client.query<{ id: string }>('insert into public.guilds (name) values ($1) returning id', [`gg${nextUid}`]);
  await env.client.query(`insert into public.guild_members (guild_id, user_id, role) values ($1, $2, 'leader')`, [g.id, uid]);
  if (total > 0) {
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears)
      values ($1, null, '2030-01-01', 0, $2)`, [g.id, total]);
  }
  return { uid, guild: g.id };
}

const contributions = async (uid: string) => (await env.client.query<{ day: string; fame: number; clears: number }>(
  `select to_char(day, 'YYYY-MM-DD') as day, fame, clears from public.guild_contributions where user_id = $1 order by day`, [uid])).rows;
const logs = async (guild: string) => (await env.client.query<{ kind: string; user_id: string; detail: string | null }>(
  'select kind, user_id, detail from public.guild_logs where guild_id = $1 order by id', [guild])).rows;
const catchPond = { type: 'catch', spot: 'pond', judgment: 'auto' } as const;
const fameOf = async (uid: string) =>
  Number((await env.client.query<{ fame: string }>('select fame from public.saves_current where user_id = $1', [uid])).rows[0].fame);

describe('기여', () => {
  it('캐치로 얻은 명성만큼 그날(게임 날짜)의 기여가 쌓인다. 길드가 없으면 쌓지 않는다', async () => {
    const { uid } = await member();
    expect((await callAction(userToken(uid), catchPond)).status).toBe(200);
    expect(await contributions(uid)).toEqual([{ day: TODAY, fame: await fameOf(uid), clears: 0 }]);

    const solo = await seedUser(env.client, { uid: testUid(nextUid++), email: 'solo@test.dev', state: {} });
    expect((await callAction(userToken(solo), catchPond)).status).toBe(200);
    expect(await env.client.query('select 1 from public.guild_contributions where user_id = $1', [solo])).toMatchObject({ rowCount: 0 });
  });

  it('명성 기여는 하루 1,000에서 멈추고, 전날의 기여는 상한에 들지 않는다', async () => {
    const { uid, guild } = await member();
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values
      ($1, $2, $3, 1000, 0), ($1, $2, $4, 998, 0)`, [guild, uid, YESTERDAY, TODAY]);
    expect((await callAction(userToken(uid), catchPond)).status).toBe(200);
    expect(await contributions(uid)).toEqual([
      { day: YESTERDAY, fame: 1000, clears: 0 },
      { day: TODAY, fame: 1000, clears: 0 },
    ]);
  });

  it('일반 의뢰 클리어는 500, 네임드 토벌은 1,000을 명성 상한과 따로 쌓고, 네임드 토벌은 항해일지에 남는다', async () => {
    const general = BOUNTIES.find(b => b.zone === 'pacific' && b.difficulty === 'easy')!;
    const named = BOUNTIES.find(b => b.zone === 'pacific' && b.difficulty === 'named')!;
    const { uid, guild } = await member();
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, $2, $3, 1000, 0)`,
      [guild, uid, TODAY]);
    for (const q of [general, named]) {
      await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, $4, $5)',
        [uid, q.zone, q.id, q.count, NOW]);
    }
    expect((await callAction(userToken(uid), { type: 'deliverBounty', questId: general.id })).status).toBe(200);
    vi.setSystemTime(Date.parse(NOW) + 2000);
    expect((await callAction(userToken(uid), { type: 'deliverBounty', questId: named.id })).status).toBe(200);
    expect(await contributions(uid)).toEqual([{ day: TODAY, fame: 1000, clears: 1500 }]);
    expect(await logs(guild)).toEqual([{ kind: 'named', user_id: uid, detail: named.id }]);
  });
});

describe('길드 레벨과 천장·의뢰 보상', () => {
  it('어종 천장은 길드 레벨과 관계없이 같은 문턱에서 확정한다. 전설 획득은 항해일지에 남는다', async () => {
    const near = await member({ state: { pity: { goldcarp: SPECIES_PITY_K * 0.95 } } }, 100_000);
    const plain = await callAction(userToken(near.uid), catchPond);
    expect((plain.body as { result: { fishId: string } }).result.fishId).not.toBe('goldcarp');

    const { uid, guild } = await member({ state: { pity: { goldcarp: SPECIES_PITY_K } } }, 100_000);
    const full = await callAction(userToken(uid), catchPond);
    expect((full.body as { result: { fishId: string } }).result.fishId).toBe('goldcarp');
    expect(await logs(guild)).toEqual([{ kind: 'legendary', user_id: uid, detail: 'goldcarp' }]);
    expect(await contributions(uid)).toEqual([{ day: TODAY, fame: RARITY.legendary.fame, clears: 0 }]);
  });

  it('일반 의뢰 보상은 길드 레벨과 관계없이 그대로다', async () => {
    const quest = BOUNTIES.find(b => b.zone === 'pacific' && b.difficulty === 'easy')!;
    const { uid } = await member({ state: { gold: 0 } }, 100_000);
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, $4, $5)',
      [uid, quest.zone, quest.id, quest.count, NOW]);
    expect((await callAction(userToken(uid), { type: 'deliverBounty', questId: quest.id })).status).toBe(200);
    const { rows: [s] } = await env.client.query<{ gold: string }>('select gold from public.saves_current where user_id = $1', [uid]);
    expect(Number(s.gold)).toBe(quest.reward);
  });
});
