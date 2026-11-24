// 실제 useDevTools + HttpGameGateway + 서버 액션/페이싱 통합 테스트.
// dispatch를 목으로 뭉개지 않고, 실제 HTTP 게이트웨이와 서버 페이싱·debugBatch·패치 복원을 연결해
// 전 프리셋 429 0건, 도감(selectDexGrid/selectNamedDex) 반영, 예외 안전성을 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { parseAction } from '../../../game/rules/actionSchema';
import { applyAction, pickScalars } from '../../../game/rules/actions';
import type { GameAction } from '../../../game/rules/actions';
import { MIN_ACTION_GAP_FAST_MS, MIN_ACTION_GAP_MS, PACING_SLOW_TYPES } from '../../../game/rules/balance';
import { isDebugTableCommand, parseBountyResetKind, parseSnapshotBounty } from '../../../game/rules/debug';
import type { DevBountySnapshot } from '../../../game/rules/debug';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { catchTooSoon } from '../../../game/rules/pacing';
import { gameDayStartISO, previousGameDayISO } from '../../../game/rules/time';
import { bountyById, bountyKindOf } from '../../../game/content/bounties';
import { NAMED } from '../../../game/content/named';
import { ZONE_IDS } from '../../../game/content/zones';
import { selectDexGrid, selectNamedDex } from '../../dex/model/catalog';
import { DEV_PRESETS } from '../model/presets';
import { useDevTools } from './useDevTools';

vi.mock('../../../platform/adapters/auth', () => ({ isCloud: true }));

import { HttpGameGateway } from '../../../platform/adapters/httpGameGateway';

interface SimServer {
  state: GameState;
  version: number;
  updatedAtMs: number;
  lastCatchAt: string | null;
  bounty: DevBountySnapshot;
  rateLimit429Count: number;
  requests: GameAction[];
}

function createSimServer(initial: GameState = newState()): SimServer {
  return {
    state: initial,
    version: 2,
    updatedAtMs: 0,
    lastCatchAt: null,
    bounty: { clears: [], progress: [], tickets: [] },
    rateLimit429Count: 0,
    requests: [],
  };
}

function installSimFetch(sim: SimServer) {
  const slow = new Set<string>(PACING_SLOW_TYPES);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/me?q=state') {
      const { bag, exhibit, dex, gold, fame, boat, rod, achievementCounters: _ac, clearedNamed: _cn, ...rest } = sim.state;
      return json({
        cur: { data: rest, gold, fame, boat, rod, version: sim.version },
        instances: [
          ...bag.map(i => ({ uid: i.uid, fish_id: i.fishId, form: i.form, size: i.size, caught_at: i.caughtAt, spot: i.spot, judgment: i.judgment, slot: null, locked: i.locked })),
          ...exhibit.flatMap((i, slot) => i ? [{ uid: i.uid, fish_id: i.fishId, form: i.form, size: i.size, caught_at: i.caughtAt, spot: i.spot, judgment: i.judgment, slot, locked: i.locked }] : []),
        ],
        records: Object.entries(dex).flatMap(([fish_id, forms]) =>
          Object.entries(forms).flatMap(([form, rec]) => rec ? [{ fish_id, form, count: rec.count, max_size: rec.maxSize, first_caught: rec.first }] : [])),
        counters: sim.state.achievementCounters,
        clearedNamed: sim.state.clearedNamed,
        legacy: null,
      });
    }
    if (url !== '/api/action') return json({ error: 'not-found' }, 404);

    const parsed = parseAction(JSON.parse(String(init?.body ?? 'null')));
    if (!parsed) return json({ error: 'bad-action' }, 400);
    sim.requests.push(parsed);

    // 실제 api/action.ts와 동일한 페이싱 검사 (debug/debugBatch/debugSnapshot 및 강제 캐치는 면제)
    const nowMs = Date.now();
    const exempt = parsed.type === 'debug'
      || parsed.type === 'debugBatch'
      || parsed.type === 'debugSnapshot'
      || (parsed.type === 'catch' && Boolean(parsed.forceEncounter || parsed.forcePhase));
    if (!exempt && sim.updatedAtMs > 0) {
      const gap = slow.has(parsed.type) ? MIN_ACTION_GAP_MS : MIN_ACTION_GAP_FAST_MS;
      if (nowMs - sim.updatedAtMs < gap) {
        sim.rateLimit429Count++;
        return json({ error: 'too-fast' }, 429);
      }
      if (parsed.type === 'catch' && catchTooSoon(sim.state, parsed.spot, sim.lastCatchAt, new Date(nowMs).toISOString())) {
        sim.rateLimit429Count++;
        return json({ error: 'too-fast' }, 429);
      }
    }

    if (parsed.type === 'debugSnapshot') {
      return json({
        patch: {
          version: sim.version, baseVersion: sim.version, scalars: pickScalars(sim.state),
          writes: { instancesAdded: [], instancesRemoved: [], instancesMoved: [], instancesLocked: [], records: [] },
        },
        result: { type: 'debugSnapshot', bounty: structuredClone(sim.bounty) },
      });
    }

    const nowISO = new Date(nowMs).toISOString();
    const dayStart = gameDayStartISO(nowISO);
    const dayStartMs = Date.parse(dayStart);
    const bountyCtx = {
      clearsToday: {
        general: sim.bounty.clears.filter(c => c.kind === 'general' && Date.parse(c.clearedAt) >= dayStartMs).length,
        named: sim.bounty.clears.filter(c => c.kind === 'named' && Date.parse(c.clearedAt) >= dayStartMs).length,
      },
      tickets: sim.bounty.tickets,
      complete: [],
      active: sim.bounty.progress.map(p => p.questId),
    };

    const out = applyAction(sim.state, parsed, {
      rng: () => 0.1,
      today: '2026-10-16',
      now: nowISO,
      newUid: () => crypto.randomUUID(),
      bounty: bountyCtx,
    });
    if (!out.ok) return json({ error: out.error }, 422);

    // DB 수배 표 부작용 시뮬레이션
    const applyDbDebug = (cmd: string, args: Record<string, unknown> = {}) => {
      if (isDebugTableCommand(cmd)) {
        if (cmd === 'bounty.clearTickets') sim.bounty.tickets = [];
        else if (cmd === 'bounty.clearProgress') sim.bounty.progress = [];
        else if (cmd === 'bounty.resetToday') {
          const kind = parseBountyResetKind(args) ?? 'all';
          sim.bounty.clears = sim.bounty.clears.filter(c =>
            Date.parse(c.clearedAt) < dayStartMs || (kind !== 'all' && c.kind !== kind));
        }
      } else if (cmd === 'snapshot.restore' && args.bounty) {
        const b = parseSnapshotBounty(args.bounty);
        if (b) sim.bounty = structuredClone(b);
      } else if (cmd === 'named.unlock') {
        const prev = new Set(sim.state.clearedNamed);
        const addedAt = args.consumeDailyCap === true ? nowISO : previousGameDayISO(nowISO);
        for (const id of out.state.clearedNamed) {
          if (!prev.has(id)) sim.bounty.clears.push({ kind: 'named', questId: id, clearedAt: addedAt });
        }
      }
    };
    if (parsed.type === 'debug') applyDbDebug(parsed.command, parsed.args);
    else if (parsed.type === 'debugBatch') {
      for (const s of parsed.steps) applyDbDebug(s.command, s.args);
    } else if (parsed.type === 'acceptQuest') {
      const q = bountyById(parsed.questId)!;
      sim.bounty.progress.push({ zone: q.zone, questId: q.id, progress: 0, startedAt: nowISO });
    } else if (parsed.type === 'deliverBounty') {
      const q = bountyById(parsed.questId)!;
      sim.bounty.clears.push({ kind: bountyKindOf(q), questId: q.id, clearedAt: nowISO });
    }

    const baseVersion = sim.version;
    sim.state = {
      ...out.state,
      clearedNamed: sim.bounty.clears.filter(c => c.kind === 'named').map(c => c.questId),
    };
    sim.version += 1;
    sim.updatedAtMs = nowMs;
    if (parsed.type === 'catch') sim.lastCatchAt = nowISO;

    return json({
      patch: { version: sim.version, baseVersion, scalars: pickScalars(sim.state), writes: out.writes },
      result: out.result,
    });
  });
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useDevTools + HttpGameGateway + 서버 페이싱 통합', () => {
  it('모든 DEV_PRESETS 실행 시 429 0건이며 도감(selectDexGrid/selectNamedDex)까지 즉시 반영된다', async () => {
    const sim = createSimServer();
    installSimFetch(sim);
    const gw = new HttpGameGateway();
    let latestState = (await gw.load())!;

    const dispatch = async (action: GameAction) => {
      const r = await gw.dispatch(action);
      if (r.status === 'ok') latestState = r.state;
      return r;
    };

    const { result } = renderHook(() => useDevTools(dispatch, {
      onTeleportBase: async base => (await dispatch({ type: 'travel', to: { kind: 'base', id: base } })).status === 'ok',
    }));

    for (const preset of DEV_PRESETS) {
      await act(async () => {
        await result.current.runPreset(preset, { game: latestState });
      });
      expect(result.current.log[0]?.ok, `${preset.id}: ${result.current.log[0]?.text}`).toBe(true);
    }

    // 전 프리셋 실행 중 429가 단 한 건도 발생하지 않는다
    expect(sim.rateLimit429Count).toBe(0);
    // 연속 debug 스텝들은 debugBatch로 묶여 전송된다
    expect(sim.requests.some(r => r.type === 'debugBatch')).toBe(true);

    // qa-dex-complete-all 재실행 후 도감·네임드 셀렉터 검증
    const dexAllPreset = DEV_PRESETS.find(p => p.id === 'qa-dex-complete-all')!;
    await act(async () => {
      await result.current.runPreset(dexAllPreset, { game: latestState });
    });
    for (const z of ZONE_IDS) {
      const normalGrid = selectDexGrid(latestState, z, 'normal');
      const variantGrid = selectDexGrid(latestState, z, 'variant');
      expect(normalGrid.foundCount).toBe(normalGrid.fishCount);
      expect(variantGrid.foundCount).toBe(variantGrid.fishCount);
    }
    const namedData = selectNamedDex(latestState, 'pacific');
    expect(namedData.foundCount).toBe(NAMED.length);
  }, 15_000);

  it('qa-v020-package 실행 시 북대서양 일반·변이·네임드 도감이 모두 채워진다', async () => {
    const sim = createSimServer();
    installSimFetch(sim);
    const gw = new HttpGameGateway();
    let latestState = (await gw.load())!;
    const dispatch = async (action: GameAction) => {
      const r = await gw.dispatch(action);
      if (r.status === 'ok') latestState = r.state;
      return r;
    };

    const { result } = renderHook(() => useDevTools(dispatch, {
      onTeleportBase: async base => (await dispatch({ type: 'travel', to: { kind: 'base', id: base } })).status === 'ok',
    }));

    const v020 = DEV_PRESETS.find(p => p.id === 'qa-v020-package')!;
    await act(async () => {
      await result.current.runPreset(v020, { game: latestState });
    });

    expect(sim.rateLimit429Count).toBe(0);
    expect(latestState.location).toEqual({ kind: 'base', id: 'lisbon' });
    const northZoneNormal = selectDexGrid(latestState, 'northatlantic', 'normal').zones.find(z => z.id === 'northatlantic')!;
    expect(northZoneNormal.foundCount).toBe(northZoneNormal.fishCount);
    const northNamed = selectNamedDex(latestState, 'northatlantic');
    expect(northNamed.foundCount).toBe(2);
  });

  it('HttpGameGateway가 429/500/네트워크 오류를 던져도 unhandledrejection 없이 tools.log에 원인을 남긴다', async () => {
    const rejections: unknown[] = [];
    const onRejected = (e: PromiseRejectionEvent) => { rejections.push(e.reason); };
    window.addEventListener('unhandledrejection', onRejected);

    try {
      const gw = new HttpGameGateway(newState());
      const { result } = renderHook(() => useDevTools(a => gw.dispatch(a)));

      vi.stubGlobal('fetch', async () => new Response('Too Many Requests', { status: 429 }));
      await act(async () => {
        await result.current.runCommand('stats.set', { gold: 100 });
      });
      expect(result.current.log[0].ok).toBe(false);
      expect(result.current.log[0].text).toContain('rate-limited');
      expect(result.current.busy).toBe(false);

      vi.stubGlobal('fetch', async () => new Response('Bad Gateway', { status: 502 }));
      await act(async () => {
        await result.current.runCommand('stats.set', { gold: 100 });
      });
      expect(result.current.log[0].ok).toBe(false);
      expect(result.current.log[0].text).toContain('server');

      vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
      await act(async () => {
        await result.current.runCommand('stats.set', { gold: 100 });
      });
      expect(result.current.log[0].ok).toBe(false);
      expect(result.current.log[0].text).toContain('network');

      expect(rejections).toEqual([]);
    } finally {
      window.removeEventListener('unhandledrejection', onRejected);
    }
  });
});
