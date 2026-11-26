// 액션 경로의 길드 성장 — 실제 Postgres에서 기여 기록(하루 상한·게임 날짜·의뢰 클리어), 항해일지,
// 길드 레벨이 천장·의뢰 보상을 바꾸지 않음과 서버가 보너스 단계로 정한 효과(판매가·가방·돌연변이)를 검사한다.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOUNTIES } from '../src/game/content/bounties.js';
import { RARITY, capOfBoat, mutationWeightsOf, newState, priceOfInstance, variantShare } from '../src/game/rules/logic.js';
import { SPECIES_PITY_K } from '../src/game/rules/pity.js';
import { callAction, captureRealClock, fish, seedUser, seededRandom, sessionHeaders, startActionEnv, testUid, userToken } from './_dbTest/actionHarness.js';
import type { ActionEnv, SeedOptions } from './_dbTest/actionHarness.js';
import { APP_VERSION } from '../src/version.js';

const hook = { failGuild: false };

vi.mock('./observability.js', () => ({ reportServerIssue: vi.fn(async () => undefined) }));
vi.mock('./_server/livePresence.js', async importOriginal => ({
  ...await importOriginal<typeof import('./_server/livePresence.js')>(),
  notifyGuild: vi.fn(),
}));
vi.mock('./_data/guilds.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./_data/guilds.js')>();
  return {
    ...actual,
    recordGuildActivity: async (...args: Parameters<typeof actual.recordGuildActivity>) => {
      if (hook.failGuild) throw new Error('simulated-guild-write-error');
      return actual.recordGuildActivity(...args);
    },
  };
});

import { reportServerIssue } from './observability.js';
import { notifyGuild } from './_server/livePresence.js';
import { myGuild } from './_data/guilds.js';
import { database } from './_db/client.js';

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
  hook.failGuild = false;
  vi.mocked(reportServerIssue).mockClear();
  vi.mocked(notifyGuild).mockClear();
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
  const { rows: [g] } = await env.client.query<{ id: string }>('insert into public.guilds (name, code) values ($1, upper(substr(md5(random()::text), 1, 8))) returning id', [`gg${nextUid}`]);
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

  it('명성 기여는 하루 2,500에서 멈추고, 전날의 기여는 상한에 들지 않는다', async () => {
    const { uid, guild } = await member();
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values
      ($1, $2, $3, 2500, 0), ($1, $2, $4, 2498, 0)`, [guild, uid, YESTERDAY, TODAY]);
    expect((await callAction(userToken(uid), catchPond)).status).toBe(200);
    expect(await contributions(uid)).toEqual([
      { day: YESTERDAY, fame: 2500, clears: 0 },
      { day: TODAY, fame: 2500, clears: 0 },
    ]);
  });

  it('일반 의뢰 클리어는 1,000, 네임드 토벌은 1,000을 명성 상한과 따로 쌓고, 네임드 토벌은 항해일지에 남는다', async () => {
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
    expect(await contributions(uid)).toEqual([{ day: TODAY, fame: 1000, clears: 2000 }]);
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

/** 응답 시점을 그대로 보는 호출 — 응답 뒤 후속 쓰기가 끝나기를 기다리지 않는다 */
async function callBeforeFollowUps(token: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const { default: handler } = await import('./action.js');
  const out = { status: 0, body: undefined as unknown };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; },
    end() {},
  };
  await handler({
    method: 'POST',
    headers: { 'x-build-id': 'dev', 'x-client-version': APP_VERSION, ...sessionHeaders(token) },
    body,
  } as never, res as never);
  return out;
}
const resultOf = (r: { body: unknown }) => (r.body as { result: { type: string; guildUpdated?: true } }).result;
const updatedMsg = { t: 'guild', kind: 'updated', guild: '', nick: null };

describe('응답 전 반영과 갱신 알림', () => {
  it('납품 응답 직후 기여가 이미 쌓여 있고, guildUpdated와 길드 갱신 알림이 나간다', async () => {
    const quest = BOUNTIES.find(b => b.zone === 'pacific' && b.difficulty === 'easy')!;
    const { uid, guild } = await member();
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, $4, $5)',
      [uid, quest.zone, quest.id, quest.count, NOW]);
    const res = await callBeforeFollowUps(userToken(uid), { type: 'deliverBounty', questId: quest.id });
    expect(res.status).toBe(200);
    expect(resultOf(res)).toEqual({ type: 'none', guildUpdated: true });
    expect(await contributions(uid)).toEqual([{ day: TODAY, fame: 0, clears: 1000 }]);
    expect(notifyGuild).toHaveBeenCalledWith(guild, updatedMsg);
  });

  it('네임드 납품 응답 직후 항해일지에 토벌이 남는다', async () => {
    const named = BOUNTIES.find(b => b.zone === 'pacific' && b.difficulty === 'named')!;
    const { uid, guild } = await member();
    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, $4, $5)',
      [uid, named.zone, named.id, named.count, NOW]);
    const res = await callBeforeFollowUps(userToken(uid), { type: 'deliverBounty', questId: named.id });
    expect(res.status).toBe(200);
    expect(resultOf(res).guildUpdated).toBe(true);
    expect(await logs(guild)).toEqual([{ kind: 'named', user_id: uid, detail: named.id }]);
  });

  it('전설 캐치 응답 직후 항해일지와 기여가 이미 반영돼 있다', async () => {
    const { uid, guild } = await member({ state: { pity: { goldcarp: SPECIES_PITY_K } } });
    const res = await callBeforeFollowUps(userToken(uid), catchPond);
    expect(res.status).toBe(200);
    expect(resultOf(res)).toMatchObject({ type: 'catch', fishId: 'goldcarp', guildUpdated: true });
    expect(await logs(guild)).toEqual([{ kind: 'legendary', user_id: uid, detail: 'goldcarp' }]);
    expect(await contributions(uid)).toEqual([{ day: TODAY, fame: RARITY.legendary.fame, clears: 0 }]);
    expect(notifyGuild).toHaveBeenCalledWith(guild, updatedMsg);
  });

  it('전설 돌연변이 포획 시 guild_logs에 fishId|variant가 저장되고 myGuild logbook으로 반환된다', async () => {
    const { uid, guild } = await member({ state: { fortune: { day: TODAY, kind: 'gold', index: 5 } } });
    const rolls = [0.999999, 0.1, 0.5, 0.5, 0.0001];
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => rolls[i++] ?? 0.5);

    const res = await callAction(userToken(uid), catchPond);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      result: { type: 'catch', fishId: 'goldcarp', info: { form: 'variant' }, guildUpdated: true },
    });
    expect(await logs(guild)).toEqual([{ kind: 'legendary', user_id: uid, detail: 'goldcarp|variant' }]);

    const view = await myGuild(database().db, uid, NOW);
    expect(view?.logbook[0]).toMatchObject({ kind: 'legendary', uid, detail: 'goldcarp|variant' });
  });

  it('하루 명성 상한에 닿아 바뀐 것이 없으면 guildUpdated를 싣지 않고 알리지 않는다', async () => {
    const { uid, guild } = await member();
    await env.client.query(`insert into public.guild_contributions (guild_id, user_id, day, fame, clears) values ($1, $2, $3, 2500, 0)`,
      [guild, uid, TODAY]);
    const res = await callBeforeFollowUps(userToken(uid), catchPond);
    expect(res.status).toBe(200);
    expect(resultOf(res).guildUpdated).toBeUndefined();
    expect(notifyGuild).not.toHaveBeenCalled();
  });

  it('길드 쓰기가 실패해도 캐치와 납품은 확정된 채 성공하고 오류를 보고한다', async () => {
    const quest = BOUNTIES.find(b => b.zone === 'pacific' && b.difficulty === 'easy')!;
    const { uid } = await member({ state: { gold: 0 } });
    hook.failGuild = true;
    const caught = await callBeforeFollowUps(userToken(uid), catchPond);
    expect(caught.status).toBe(200);
    expect(resultOf(caught).guildUpdated).toBeUndefined();
    expect(await fameOf(uid)).toBeGreaterThan(0);
    expect((await env.client.query('select 1 from public.fish_instances where user_id = $1', [uid])).rowCount).toBe(1);

    await env.client.query('insert into public.bounty_progress (user_id, zone, quest_id, progress, started_at) values ($1, $2, $3, $4, $5)',
      [uid, quest.zone, quest.id, quest.count, NOW]);
    vi.setSystemTime(Date.parse(NOW) + 2000);
    const delivered = await callBeforeFollowUps(userToken(uid), { type: 'deliverBounty', questId: quest.id });
    expect(delivered.status).toBe(200);
    const { rows: [s] } = await env.client.query<{ gold: string }>('select gold from public.saves_current where user_id = $1', [uid]);
    expect(Number(s.gold)).toBe(quest.reward);
    expect((await env.client.query('select 1 from public.bounty_clears where user_id = $1', [uid])).rowCount).toBe(1);

    expect(await contributions(uid)).toEqual([]);
    expect(notifyGuild).not.toHaveBeenCalled();
    expect(reportServerIssue).toHaveBeenCalledWith('후속 쓰기 실패 — 길드 기여/항해일지 반영 실패', expect.any(Error),
      expect.objectContaining({ uid, action: 'catch' }));
    expect(reportServerIssue).toHaveBeenCalledWith('후속 쓰기 실패 — 길드 기여/항해일지 반영 실패', expect.any(Error),
      expect.objectContaining({ uid, action: 'deliverBounty' }));
  });
});

describe('보너스 효과(서버 판정)', () => {
  const rank = (guild: string, bonus: string, r: number) => env.client.query(
    'insert into public.guild_bonuses (guild_id, bonus, rank) values ($1, $2, $3)', [guild, bonus, r]);
  const goldOf = async (uid: string) =>
    Number((await env.client.query<{ gold: string }>('select gold from public.saves_current where user_id = $1', [uid])).rows[0].gold);

  it('판매는 판매가 보너스를 판매 총액에 한 번 더한다. 레벨로 열린 1단계는 기부 없이도 적용된다', async () => {
    const bag = [fish('crucian'), fish('crucian')];
    const base = bag.reduce((a, i) => a + priceOfInstance(i), 0);
    const sell = async (total: number, stored: number | null) => {
      const items = bag.map(i => ({ ...i, uid: crypto.randomUUID() }));
      const { uid, guild } = await member({ state: { gold: 0, bag: items } }, total);
      if (stored !== null) await rank(guild, 'sell', stored);
      expect((await callAction(userToken(uid), { type: 'sell', uids: items.map(i => i.uid) })).status).toBe(200);
      return goldOf(uid);
    };
    expect(await sell(0, null)).toBe(base + Math.round(base * 0.02));
    expect(await sell(25_000, 3)).toBe(base + Math.round(base * 0.06));
  });

  it('캐치 fast path는 가방 보너스만큼 늘어난 칸으로 넘침을 판정한다', async () => {
    const full = () => Array.from({ length: capOfBoat(0) }, () => fish('crucian'));
    const solo = await seedUser(env.client, { uid: testUid(nextUid++), email: 'bag-solo@test.dev', state: { boat: 0, bag: full() } });
    const plain = await callAction(userToken(solo), catchPond);
    expect((plain.body as { result: { released: unknown[] } }).result.released).toHaveLength(1);
    const { uid } = await member({ state: { boat: 0, bag: full() } }, 10_000); // Lv2 — 가방 용량 1단계
    const boosted = await callAction(userToken(uid), catchPond);
    expect((boosted.body as { result: { released: unknown[] } }).result.released).toEqual([]);
  });

  it('캐치 fast path는 돌연변이 폼 가중치에 길드 보너스(+4%/단)를 더한다', async () => {
    const baseShare = variantShare(mutationWeightsOf(newState(), 'pond'));
    const boostedShare = variantShare(mutationWeightsOf(newState(), 'pond', 0, 0, 1, 0.2));
    const r = (baseShare + boostedShare) / 2;
    vi.spyOn(Math, 'random').mockReturnValue(r);
    const solo = await seedUser(env.client, { uid: testUid(nextUid++), email: 'mut-solo@test.dev', state: {} });
    const plain = await callAction(userToken(solo), catchPond);
    expect((plain.body as { result: { info: { form: string } } }).result.info.form).toBe('normal');
    const { uid, guild } = await member({}, 100_000);
    await rank(guild, 'mutation', 5);
    const boosted = await callAction(userToken(uid), catchPond);
    expect((boosted.body as { result: { info: { form: string } } }).result.info.form).toBe('variant');
  });
});
