// 핸들러 규약 스모크 — v0.2.2 사고 클래스 ②(호출 규약) 가드.
// 서버 진입점은 default export를 Node 스타일 (req, res)로 호출한다 — 이 테스트는
// 그 계약(시그니처·res.status().json() 체인·메서드/설정 가드)이 커밋 전에 깨지면 CI에서 즉사시킨다.
// NodeNext 설정이 서버 모듈의 해상도를 정적으로 검사하므로 여기서는 중복하지 않는다.
import { afterEach, describe, it, expect, vi } from 'vitest';
import handler, {
  fastCatch, guildLogsOf, parseFortuneSetArgs, parseServerAction, recordsToDex, SKIP_DETAIL,
} from './action.js';
import type { RecordRow, StateRow } from './_data/load.js';
import type { Executor } from './_db/client.js';
import { NO_GUILD_EFFECTS } from '../src/game/rules/guild.js';
import { AUTO_ENERGY_BOAT, ENERGY_ITEM_IDS, ENERGY_PER_INDIVIDUAL } from '../src/game/content/cooking.js';
import { BOATS, FISH, fishDrawShares, fishDrawWeight, newState, RARITY } from '../src/game/rules/logic.js';
import { rodAxes } from '../src/game/rules/stats.js';
import { FORTUNE_CATALOG } from '../src/game/rules/fortune.js';
import type { DailyFortune } from '../src/game/rules/fortune.js';
import { endedFirstCatch } from '../src/game/rules/firstCatch.js';
import { gameDayOf } from '../src/game/rules/time.js';
import { APP_VERSION } from '../src/version.js';

function mkRes() {
  const r = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) { r.statusCode = code; return r; },
    json(b: unknown) { r.body = b; },
    end() { /* 204 무본문 */ },
  };
  return r;
}

describe('api/action 핸들러 규약 (Node 스타일 req/res)', () => {
  it('GET은 워밍/헬스 핑 — 204 무본문 (콘솔 노이즈 없는 응답)', async () => {
    const res = mkRes();
    await handler({ method: 'GET', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(204);
  });

  it('GET/POST 외 메서드는 405', async () => {
    const res = mkRes();
    await handler({ method: 'PUT', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'method-not-allowed' });
  });

  it('배포 식별자 불일치(또는 부재)면 426 — 낡은 탭 차단', async () => {
    const res = mkRes();
    await handler({ method: 'POST', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(426);
    expect(res.body).toEqual({ error: 'version-mismatch', server: APP_VERSION });
    const res2 = mkRes();
    await handler({ method: 'POST', headers: { 'x-build-id': 'other-deploy' } } as never, res2 as never);
    expect(res2.statusCode).toBe(426);
  });

  it('릴리즈 버전이 같아도 배포가 다르면 426 — dev 빌드끼리 갈리는 게 요점', async () => {
    // 구버전 클라가 보내던 헤더. APP_VERSION은 dev에서 안 올라가 늘 일치했다 → 426이 안 떴다
    const res = mkRes();
    await handler({ method: 'POST', headers: { 'x-client-version': APP_VERSION } } as never, res as never);
    expect(res.statusCode).toBe(426);
  });

  describe('운영은 릴리즈 버전으로 낡은 탭을 가른다', () => {
    afterEach(() => { delete process.env.DEPLOY_ENV; });

    it('운영: 버전이 같으면 배포 식별자가 달라도 통과한다', async () => {
      process.env.DEPLOY_ENV = 'production';
      const res = mkRes();
      await handler({ method: 'POST', headers: { 'x-build-id': 'other-deploy', 'x-client-version': APP_VERSION } } as never, res as never);
      // 낡은 탭 판정을 지나 다음 관문(서버 설정)에서 멈춘다
      expect(res.statusCode).toBe(500);
    });

    it('운영: 버전이 다르거나 없으면 426이다', async () => {
      process.env.DEPLOY_ENV = 'production';
      for (const headers of [{ 'x-build-id': 'dev', 'x-client-version': '0.0.1' }, { 'x-build-id': 'dev' }]) {
        const res = mkRes();
        await handler({ method: 'POST', headers } as never, res as never);
        expect(res.statusCode).toBe(426);
        expect(res.body).toEqual({ error: 'version-mismatch', server: APP_VERSION });
      }
    });

    it('스테이징: 버전이 같아도 배포 식별자가 다르면 426이다', async () => {
      process.env.DEPLOY_ENV = 'preview';
      const res = mkRes();
      await handler({ method: 'POST', headers: { 'x-build-id': 'other-deploy', 'x-client-version': APP_VERSION } } as never, res as never);
      expect(res.statusCode).toBe(426);
    });
  });

  it('배포 식별자 일치 + 서버 환경변수 없으면 500 server-config (테스트 환경 = env 없음)', async () => {
    // 테스트 환경엔 BUILD_ID가 없어 서버 기준값이 'dev'로 떨어진다
    const res = mkRes();
    await handler({ method: 'POST', headers: { 'x-build-id': 'dev' } } as never, res as never);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'server-config' });
  });

  it('acceptQuest는 개체·도감 스킵 금지 — 네임드 라이선스 도감 판정이 상태를 본다', () => {
    // 수주는 상태를 바꾸지 않지만 네임드 토벌 판정에 dex가 필요해 records를 읽어야 한다.
    // 스킵하면 dex 빈 조립 → 도감과 무관하게 dex-incomplete 422 (수주 불가 장애).
    expect(SKIP_DETAIL.has('acceptQuest')).toBe(false);
    // 납품·포기·불변 액션은 스킵 유지 (서버 주입·스칼라만이라 도감 불필요)
    expect(SKIP_DETAIL.has('deliverBounty')).toBe(true);
    expect(SKIP_DETAIL.has('abandonQuest')).toBe(true);
    expect(SKIP_DETAIL.has('exchangeArtifact')).toBe(true); // 재료·유물은 blob이라 스칼라 동봉
    expect(SKIP_DETAIL.has('levelUpArtifact')).toBe(true); // 레벨 맵과 재료도 blob이라 같은 기준
    expect(SKIP_DETAIL.has('boot')).toBe(true);
    // 옷장·쿠폰 액션은 골드와 blob(외형·가진 모자·사용 쿠폰·아이템)만 바꾼다
    for (const t of ['redeemCoupon', 'changeClothes', 'buyHat', 'wearHat']) expect(SKIP_DETAIL.has(t), t).toBe(true);
    // 요리와 기운 설정·기운 변환·물약 사용은 가방 개체를 쓰지 않아 스킵하고, 기운 얻기는 개체를 소비하므로 스킵하지 않는다
    for (const t of ['cook', 'cancelCook', 'eat', 'transmuteEnergy', 'usePotion', 'setEnergyTarget', 'resetEnergyTargets', 'dismissBaitRefund', 'setAutoLockOnCatch']) expect(SKIP_DETAIL.has(t), t).toBe(true);
    expect(SKIP_DETAIL.has('extractEnergy')).toBe(false);
  });
});

describe('guildLogsOf', () => {
  it('일반 전설 또는 form이 생략된 전설 캐치는 fishId만 기록한다', () => {
    expect(guildLogsOf([
      { type: 'catch', payload: { fishId: 'goldcarp', form: 'normal' } },
      { type: 'catch', payload: { fishId: 'goldcarp' } },
    ])).toEqual([
      { kind: 'legendary', detail: 'goldcarp' },
      { kind: 'legendary', detail: 'goldcarp' },
    ]);
  });

  it('돌연변이 전설 캐치는 fishId|variant 형식으로 기록한다', () => {
    expect(guildLogsOf([
      { type: 'catch', payload: { fishId: 'goldcarp', form: 'variant' } },
    ])).toEqual([
      { kind: 'legendary', detail: 'goldcarp|variant' },
    ]);
  });

  it('전설이 아닌 돌연변이 캐치는 항해일지에 남기지 않는다', () => {
    expect(guildLogsOf([
      { type: 'catch', payload: { fishId: 'crucian', form: 'variant' } },
    ])).toEqual([]);
  });
});

describe('fastCatch 지역 누적 보너스 도감 로드', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeDb(records: RecordRow[]) {
    const execute = vi.fn(async () => {
      if (execute.mock.calls.length === 1) {
        return { rows: [{ records }] };
      }
      return {
        rows: [{ dex: null, bag: 0, max_locked_size: null, prev_auto: null }],
      };
    });
    return { db: { execute } as unknown as Executor, execute };
  }

  function makeStateRow(
    now: string,
    overrides: Partial<ReturnType<typeof newState>> = {},
  ): StateRow {
    const base = {
      ...newState(),
      boat: 1,
      rod: 6,
      fortune: { day: gameDayOf(now), kind: 'gold' as const, index: 3 as const },
      ...overrides,
    };
    const { bag: _b, exhibit: _e, dex: _d, gold, fame, boat, rod, achievementCounters: _ac, clearedNamed: _cn, ...data } = base;
    return { data, version: 2, gold, fame, boat, rod };
  }

  function mockRolls(seq: number[]) {
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[i++] ?? 0.5);
  }

  it('recordsToDex는 일반·변이 행을 GameState.dex 형태로 변환한다', () => {
    expect(recordsToDex([
      { fish_id: 'shark', form: 'normal', count: 20, max_size: 210, first_caught: '2026-01-01T00:00:00Z' },
      { fish_id: 'mackerel', form: 'variant', count: 500, max_size: null, first_caught: null },
    ])).toEqual({
      shark: { normal: { count: 20, maxSize: 210, first: '2026-01-01' } },
      mackerel: { variant: { count: 500, maxSize: null, first: null } },
    });
  });

  it('fastCatch는 챔질 경과를 커서 위치로 바꿔 catch 이벤트에만 싣는다', async () => {
    const now = '2030-03-04T05:30:00.000Z';
    const row = makeStateRow(now, { rod: 10, firstCatch: endedFirstCatch() });
    const state = { ...newState(), boat: row.boat, rod: row.rod };
    const biteElapsed = 700;
    mockRolls([0.1, 0.1, 0.5, 0.5, 0.5]);

    const out = await fastCatch(makeDb([]).db, 'u1', row, 'pond', 'perfect', now,
      NO_GUILD_EFFECTS, false, {}, [], undefined, biteElapsed);
    if (!out.ok) throw new Error(out.error);
    expect(out.events[0]).toMatchObject({
      type: 'catch',
      payload: { pos: expect.any(Number) },
    });
    const payload = out.events[0].payload as { pos: number };
    expect(payload.pos).toBeCloseTo(biteElapsed / 1000 / rodAxes(state).sweep.value, 8);
    expect(out.result).not.toHaveProperty('pos');
  });

  it('fastCatch는 챔질 경과가 없으면 커서 위치를 싣지 않는다', async () => {
    const now = '2030-03-04T05:30:00.000Z';
    const row = makeStateRow(now, { rod: 10, firstCatch: endedFirstCatch() });
    mockRolls([0.1, 0.1, 0.5, 0.5, 0.5]);
    const missing = await fastCatch(makeDb([]).db, 'u1', row, 'pond', 'perfect', now,
      NO_GUILD_EFFECTS, false, {}, []);
    if (!missing.ok) throw new Error(missing.error);
    expect(missing.events[0].payload).not.toHaveProperty('pos');
  });

  it('fastCatch는 수동 카운터 없이도 records(normal)에서 rareWeight를 계산해 drawCatch에 반영하고 loadRecords를 1회만 호출한다', async () => {
    const now = '2030-03-04T05:30:00.000Z';
    const row = makeStateRow(now);

    const empty = makeDb([]);
    mockRolls([0.738, 0.1, 0.5, 0.5]);
    const plain = await fastCatch(empty.db, 'u1', row, 'sea', 'normal', now, NO_GUILD_EFFECTS, false, {}, []);
    expect(plain.ok && plain.result.type === 'catch' && plain.result.fishId).toBe('mackerel');
    expect(empty.execute).toHaveBeenCalledTimes(2);

    const filled = makeDb([
      { fish_id: 'shark', form: 'normal', count: 20, max_size: 200, first_caught: '2026-01-01' },
    ]);
    mockRolls([0.738, 0.1, 0.5, 0.5]);
    const boosted = await fastCatch(filled.db, 'u1', row, 'sea', 'normal', now, NO_GUILD_EFFECTS, false, {}, []);
    expect(boosted.ok && boosted.result.type === 'catch' && boosted.result.fishId).toBe('seabream');
    expect(filled.execute).toHaveBeenCalledTimes(2);
  });

  it('fastCatch는 records(normal)의 밤 전설 포획 수로 nightWeight를 계산해 drawCatch에 반영한다', async () => {
    const now = '2030-03-04T05:05:00.000Z';
    const row = makeStateRow(now);

    const empty = makeDb([]);
    mockRolls([0.995, 0.331, 0.5, 0.5]);
    const plain = await fastCatch(empty.db, 'u1', row, 'sea', 'normal', now, NO_GUILD_EFFECTS, false, {}, []);
    expect(plain.ok && plain.result.type === 'catch' && plain.result.fishId).toBe('shark');

    const filled = makeDb([
      { fish_id: 'moonveil', form: 'normal', count: 10, max_size: 100, first_caught: '2026-01-01' },
    ]);
    mockRolls([0.995, 0.331, 0.5, 0.5]);
    const boosted = await fastCatch(filled.db, 'u1', row, 'sea', 'normal', now, NO_GUILD_EFFECTS, false, {}, []);
    expect(boosted.ok && boosted.result.type === 'catch' && boosted.result.fishId).toBe('moonveil');
    expect(filled.execute).toHaveBeenCalledTimes(2);
  });

  it('fastCatch는 records(variant)의 변이 포획 수로 mutationWeight를 계산해 drawCatch에 반영한다', async () => {
    const now = '2030-03-04T05:30:00.000Z';
    const row = makeStateRow(now);

    const empty = makeDb([]);
    mockRolls([0.1, 0.1, 0.5, 0.5, 0.251]);
    const plain = await fastCatch(empty.db, 'u1', row, 'sea', 'normal', now, NO_GUILD_EFFECTS, false, {}, []);
    expect(plain.ok && plain.result.type === 'catch' && plain.result.info.form).toBe('normal');

    const filled = makeDb([
      { fish_id: 'mackerel', form: 'variant', count: 500, max_size: 40, first_caught: '2026-01-01' },
    ]);
    mockRolls([0.1, 0.1, 0.5, 0.5, 0.251]);
    const boosted = await fastCatch(filled.db, 'u1', row, 'sea', 'normal', now, NO_GUILD_EFFECTS, false, {}, []);
    expect(boosted.ok && boosted.result.type === 'catch' && boosted.result.info.form).toBe('variant');
    expect(filled.execute).toHaveBeenCalledTimes(2);
  });

  it('fastCatch는 legendary·night·mutation·bigCatch·fame·energy 운세 채널과 catch 이벤트 fame을 반영한다', async () => {
    const dayNow = '2030-03-04T05:30:00.000Z';
    const day = gameDayOf(dayNow);
    const fortune = (kind: DailyFortune['kind'], index: 3 | 5 = 5): DailyFortune => ({ day, kind, index });

    const catchFish = (out: Awaited<ReturnType<typeof fastCatch>>) => {
      if (!out.ok || out.result.type !== 'catch') throw new Error('expected catch');
      const id = out.result.fishId;
      return { out, result: out.result, fish: FISH.find(f => f.id === id)! };
    };

    // 1. legendary (golden-scale ×1.10) + 작은 바다 영약 (×1.05) = ×1.155 경계 검증
    const shareWith = (o: { rarityLuck?: number; legendaryLuck?: number }) =>
      fishDrawShares('sea', o).filter(s => s.fish.rarity === 'legendary').reduce((a, b) => a + b.share, 0);
    const rLegEdge = 1 - (shareWith({ rarityLuck: 1.05 }) + shareWith({ rarityLuck: 1.05, legendaryLuck: 1.10 })) / 2;
    const legOverrides = { rod: 10, potions: { 'luck-small': day } };

    mockRolls([rLegEdge, 0.1, 0.5, 0.5, 0.5]);
    const legPlain = catchFish(await fastCatch(makeDb([]).db, 'u1', makeStateRow(dayNow, { ...legOverrides, fortune: fortune('gold') }),
      'sea', 'normal', dayNow, NO_GUILD_EFFECTS, false, {}, []));
    mockRolls([rLegEdge, 0.1, 0.5, 0.5, 0.5]);
    const legBoost = catchFish(await fastCatch(makeDb([]).db, 'u1', makeStateRow(dayNow, { ...legOverrides, fortune: fortune('golden-scale') }),
      'sea', 'normal', dayNow, NO_GUILD_EFFECTS, false, {}, []));
    expect(legPlain.fish.rarity).toBe('epic');
    expect(legBoost.fish.rarity).toBe('legendary');

    // 2. night (night ×1.10) — 밤 정점(02:00) 경계 난수에서 밤 어종 선택
    const nightNow = '2030-03-04T05:05:00.000Z';
    const legCands = FISH.filter(f => f.spot === 'sea' && f.rarity === 'legendary');
    const totalPlain = legCands.reduce((s, f) => s + fishDrawWeight(f, { phase: 'night', nightDepth: 1, nightLuck: 1 }), 0);
    const totalNight = legCands.reduce((s, f) => s + fishDrawWeight(f, { phase: 'night', nightDepth: 1, nightLuck: 1.10 }), 0);
    const rNightFish = (
      fishDrawWeight(legCands[0], { phase: 'night', nightDepth: 1, nightLuck: 1 }) / totalPlain
      + fishDrawWeight(legCands[0], { phase: 'night', nightDepth: 1, nightLuck: 1.10 }) / totalNight
    ) / 2;
    mockRolls([0.999999, rNightFish, 0.5, 0.5, 0.5]);
    const nightPlain = catchFish(await fastCatch(makeDb([]).db, 'u1', makeStateRow(nightNow, { fortune: { day: gameDayOf(nightNow), kind: 'gold', index: 5 } }),
      'sea', 'normal', nightNow, NO_GUILD_EFFECTS, false, {}, []));
    mockRolls([0.999999, rNightFish, 0.5, 0.5, 0.5]);
    const nightBoost = catchFish(await fastCatch(makeDb([]).db, 'u1', makeStateRow(nightNow, { fortune: { day: gameDayOf(nightNow), kind: 'night', index: 5 } }),
      'sea', 'normal', nightNow, NO_GUILD_EFFECTS, false, {}, []));
    expect(nightPlain.fish.night).toBeFalsy();
    expect(nightBoost.fish.night).toBe(true);

    // 3. mutation (mirage ×1.08) + 억제 요리(×0.5) 경계
    const calmSlot = { lunch: { id: 'cook-lunch-calm', endsAt: '2030-03-05T00:00:00.000Z' }, bait: null };
    const rMutEdge = (0.5 / 3.5 + 0.54 / 3.54) / 2;
    mockRolls([0.1, 0.1, 0.5, 0.5, rMutEdge]);
    const mutPlain = catchFish(await fastCatch(makeDb([]).db, 'u1', makeStateRow(dayNow, {
      boat: 5, slots: calmSlot, firstCatch: endedFirstCatch(), fortune: fortune('gold'),
    }), 'pond', 'auto', dayNow, NO_GUILD_EFFECTS, false, {}, []));
    mockRolls([0.1, 0.1, 0.5, 0.5, rMutEdge]);
    const mutBoost = catchFish(await fastCatch(makeDb([]).db, 'u1', makeStateRow(dayNow, {
      boat: 5, slots: calmSlot, firstCatch: endedFirstCatch(), fortune: fortune('mirage'),
    }), 'pond', 'auto', dayNow, NO_GUILD_EFFECTS, false, {}, []));
    expect(mutPlain.result.info.form).toBe('normal');
    expect(mutBoost.result.info.form).toBe('variant');

    // 4. bigCatch (big ×1.50) + fame (fame ×2.00) + catch 이벤트 fame 기록
    const u1For27 = Math.exp(-0.5 * 0.6 * 0.6);
    mockRolls([0.5, 0.5, u1For27, 0, 0.5]);
    const bigPlain = catchFish(await fastCatch(makeDb([]).db, 'u1', makeStateRow(dayNow, {
      firstCatch: endedFirstCatch(), fortune: fortune('gold'),
    }), 'pond', 'normal', dayNow, NO_GUILD_EFFECTS, false, {}, []));
    mockRolls([0.5, 0.5, u1For27, 0, 0.5]);
    const bigBoost = catchFish(await fastCatch(makeDb([]).db, 'u1', makeStateRow(dayNow, {
      firstCatch: endedFirstCatch(), fortune: fortune('big', 3),
    }), 'pond', 'normal', dayNow, NO_GUILD_EFFECTS, false, {}, []));
    expect(bigPlain.result.info.isBig).toBe(false);
    expect(bigBoost.result.info.isBig).toBe(true);

    mockRolls([0.1, 0.1, 0.5, 0.5, 0.5]);
    const fameOut = catchFish(await fastCatch(makeDb([]).db, 'u1', makeStateRow(dayNow, {
      firstCatch: endedFirstCatch(), fortune: fortune('fame', 5),
    }), 'pond', 'normal', dayNow, NO_GUILD_EFFECTS, false, {}, []));
    const expectedFame = Math.round(RARITY[fameOut.fish.rarity].fame * 2);
    expect(fameOut.out.state.fame).toBe(expectedFame);
    expect(fameOut.out.events[0].payload.fame).toBe(expectedFame);

    // 5. energy (energy ×2.00) — 가공 플랜트선 가방 초과 자동 기운 얻기
    const fullBagCount = BOATS[AUTO_ENERGY_BOAT - 1].bagCap;
    const overflowExecute = vi.fn(async (query: unknown) => {
      const n = overflowExecute.mock.calls.length;
      if (n === 1) return { rows: [{ records: [] }] };
      if (n === 2) return { rows: [{ dex: null, bag: fullBagCount, max_locked_size: null, prev_auto: null }] };
      void query;
      return { rows: [{ g: 1, uid: 'victim-1', fish_id: 'crucian', form: 'normal', size: 15 }] };
    });
    const overflowDb = { execute: overflowExecute } as unknown as Executor;
    mockRolls([0.1, 0.1, 0.5, 0.5, 0.5]);
    const energyOut = await fastCatch(overflowDb, 'u1', makeStateRow(dayNow, {
      boat: AUTO_ENERGY_BOAT, firstCatch: endedFirstCatch(), fortune: fortune('energy', 5),
    }), 'pond', 'normal', dayNow, NO_GUILD_EFFECTS, false, {}, []);
    expect(energyOut.ok).toBe(true);
    if (energyOut.ok && energyOut.result.type === 'catch') {
      expect(energyOut.result.energy?.common).toBe(ENERGY_PER_INDIVIDUAL * 2);
      expect(energyOut.state.items[ENERGY_ITEM_IDS.common]).toBe(ENERGY_PER_INDIVIDUAL * 2);
      const autoEv = energyOut.events.find(e => e.type === 'autoExtractEnergy');
      expect((autoEv?.payload as { energy?: Record<string, number> } | undefined)?.energy?.common).toBe(ENERGY_PER_INDIVIDUAL * 2);
    }
  });
});

describe('fortune.set 파싱·검증', () => {
  it('21종 정본과 3등급 index 생략(5 보정)을 허용하고 잘못된 kind·index를 거부한다', () => {
    for (const entry of FORTUNE_CATALOG) {
      expect(parseFortuneSetArgs({ kind: entry.kind, index: entry.index })).toEqual({
        kind: entry.kind,
        index: entry.index,
      });
    }

    for (const tier3Kind of ['golden-scale', 'mirage', 'grand-catch'] as const) {
      expect(parseFortuneSetArgs({ kind: tier3Kind })).toEqual({ kind: tier3Kind, index: 5 });
      expect(parseFortuneSetArgs({ kind: tier3Kind, index: 3 })).toBeNull();
      expect(parseFortuneSetArgs({ kind: tier3Kind, index: 4 })).toBeNull();
    }

    for (const bad of [
      null, undefined, [], 'fish',
      { kind: 'fish' }, { kind: 'gold', index: 4 }, { kind: 'fish', index: '5' },
      { kind: 'unknown', index: 5 }, {},
    ]) {
      expect(parseFortuneSetArgs(bad)).toBeNull();
    }
  });

  it('parseServerAction은 fortune.set debug 및 debugBatch를 수용하고 미지 명령·비객체 args를 거부한다', () => {
    expect(parseServerAction({ type: 'debug', command: 'fortune.set', args: { kind: 'mirage' } })).toEqual({
      type: 'debug', command: 'fortune.set', args: { kind: 'mirage' },
    });
    expect(parseServerAction({ type: 'debug', command: 'fortune.set' })).toEqual({
      type: 'debug', command: 'fortune.set',
    });
    expect(parseServerAction({ type: 'debug', command: 'fortune.set', args: 'bad' })).toBeNull();
    expect(parseServerAction({ type: 'debug', command: 'unknown.cmd' })).toBeNull();

    expect(parseServerAction({
      type: 'debugBatch',
      steps: [
        { command: 'stats.set', args: { gold: 100 } },
        { command: 'fortune.set', args: { kind: 'golden-scale' } },
      ],
    })).toEqual({
      type: 'debugBatch',
      steps: [
        { command: 'stats.set', args: { gold: 100 } },
        { command: 'fortune.set', args: { kind: 'golden-scale' } },
      ],
    });
    expect(parseServerAction({
      type: 'debugBatch',
      steps: [{ command: 'fortune.set', args: [] }],
    })).toBeNull();
  });
});
