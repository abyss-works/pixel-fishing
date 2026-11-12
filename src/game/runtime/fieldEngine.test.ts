import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../rules/logic';
import { catchTooSoon } from '../rules/pacing';
import { HARBORS, WORLD_SPAWN } from '../world/regions/world';
import { V_PORT } from '../world/regions/village';
import { GameFieldEngine } from './fieldEngine';
import type { FieldEvent } from './fieldEngine';

vi.mock('../rendering/canvas/scenes/region.js', () => ({ renderRegion: vi.fn() }));

const ctx = {} as CanvasRenderingContext2D;
const noop = () => {};
const berth = HARBORS.harbor.berth;
const dockCenter = { x: berth.x + berth.w / 2, y: berth.y + berth.h / 2 };

function setup() {
  const engine = new GameFieldEngine('world', newState(), []);
  const onScene = vi.fn();
  const events: FieldEvent[] = [];
  engine.updateContext(newState(), false, {
    dispatch: () => ({ status: 'rejected', error: 'bad-request' }),
    onEvent: event => { events.push(event); },
    onScene,
  });
  // 프레임 하나를 직접 돌린다
  const frame = (now: number, last: number) =>
    (engine as unknown as { updateFrame(c: unknown, n: number, l: number): boolean }).updateFrame(ctx, now, last);
  return { engine, onScene, events, frame };
}

describe('GameFieldEngine 이동 잠금', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('잠금 전에는 눌린 키로 위치가 바뀐다', () => {
    const { engine, frame } = setup();
    engine.handleKeyDown('ArrowRight', noop);
    frame(1000, 950);
    expect(engine.getPosition().x).toBeGreaterThan(WORLD_SPAWN.x);
  });

  it('잠금 중에는 키와 패드를 눌러도 위치가 바뀌지 않는다', () => {
    const { engine, frame } = setup();
    engine.setControlLocked(true);
    engine.handleKeyDown('ArrowRight', noop);
    engine.setMoveDirection({ x: 1, y: 0 });
    frame(1000, 950);
    expect(engine.getPosition()).toEqual(WORLD_SPAWN);
  });

  it('잠금을 켜면 이미 눌린 키와 패드 방향이 비워져 해제 뒤에도 움직이지 않는다', () => {
    const { engine, frame } = setup();
    engine.handleKeyDown('ArrowRight', noop);
    engine.setMoveDirection({ x: 1, y: 0 });
    engine.setControlLocked(true);
    engine.setControlLocked(false);
    frame(1000, 950);
    expect(engine.getPosition()).toEqual(WORLD_SPAWN);
  });

  it('잠금 해제 뒤에는 다시 입력대로 움직인다', () => {
    const { engine, frame } = setup();
    engine.setControlLocked(true);
    engine.setControlLocked(false);
    engine.handleKeyDown('ArrowRight', noop);
    frame(1000, 950);
    expect(engine.getPosition().x).toBeGreaterThan(WORLD_SPAWN.x);
  });

  it('잠금 중에는 트리거 안이어도 onScene을 부르지 않고, 해제하면 부른다', () => {
    const { engine, onScene, frame } = setup();
    engine.placePlayer(dockCenter);
    engine.setControlLocked(true);
    expect(frame(1000, 950)).toBe(true);
    expect(onScene).not.toHaveBeenCalled();
    engine.setControlLocked(false);
    frame(1050, 1000);
    expect(onScene).toHaveBeenCalledTimes(1);
  });

  it('잠금 중에는 낚시를 시작하지 않는다', () => {
    const { engine, events } = setup();
    engine.setControlLocked(true);
    engine.action();
    expect(engine.getSnapshot().phase).toBe('idle');
    expect(events).toEqual([]);
  });

  it('잠금 중에도 프레임은 계속 돈다', () => {
    const { engine, frame } = setup();
    engine.setControlLocked(true);
    expect(frame(1000, 950)).toBe(true);
  });
});

describe('GameFieldEngine 위치 재설정', () => {
  it('지정한 좌표로 옮기고 복사본을 반환한다', () => {
    const { engine, frame } = setup();
    const target = { x: WORLD_SPAWN.x + 40, y: WORLD_SPAWN.y + 10 };
    engine.placePlayer(target);
    frame(1000, 950);
    expect(engine.getPosition()).toEqual(target);
    target.x = 0;
    expect(engine.getPosition().x).not.toBe(0);
  });

  it('도착 위치가 접안 트리거 안이면 다음 프레임에 onScene이 불린다', () => {
    const { engine, onScene, frame } = setup();
    engine.placePlayer(dockCenter);
    expect(frame(1000, 950)).toBe(false);
    expect(onScene).toHaveBeenCalledWith({ kind: 'base', id: 'harbor' }, expect.any(String));
  });

  it('낚시 중이면 줄을 거두고 대기 상태로 돌아간다', () => {
    const { engine } = setup();
    engine.updateContext(newState(), false, {
      dispatch: () => ({ status: 'rejected', error: 'bad-request' }),
      onEvent: noop,
      onScene: noop,
    });
    (engine as unknown as { transition(p: string): void }).transition('wait');
    engine.placePlayer({ x: WORLD_SPAWN.x + 5, y: WORLD_SPAWN.y });
    expect(engine.getSnapshot().phase).toBe('idle');
    engine.dispose();
  });
});

describe('GameFieldEngine 막힘 안내', () => {
  const ORIGIN_LAT = 85.0344827586207;
  const at = (lon: number, lat: number) => ({ x: (lon + 180) * 32, y: (ORIGIN_LAT - lat) * 31.9 });
  const blocked = (events: FieldEvent[]) => events.filter(e => e.type === 'zone-blocked');

  /** 키를 누른 채 프레임을 여러 번 돌린다 */
  function push(code: string, lon: number, lat: number, frames: number) {
    const s = setup();
    s.engine.placePlayer(at(lon, lat));
    s.frame(1000, 950);
    s.engine.handleKeyDown(code, noop);
    for (let i = 0; i < frames; i++) s.frame(1050 + i * 50, 1000 + i * 50);
    return s;
  }

  it('배 단계가 모자라 구역 게이트에 막혀도 키를 누르고 있는 동안 안내는 한 번이다', () => {
    const { events } = push('ArrowDown', 130, 19.25, 20); // 19N 아래는 동남아(배 3단계)
    expect(blocked(events)).toHaveLength(1);
  });

  it('열지 않은 바다에 닿은 채 키를 눌러도 안내는 한 번이다', () => {
    const { events } = push('ArrowUp', -8, -0.4, 20);
    expect(blocked(events)).toHaveLength(1);
  });

  it('경계에서 떨어졌다 다시 닿으면 안내를 다시 한다', () => {
    const { engine, events, frame } = push('ArrowUp', -8, -0.4, 10);
    engine.releaseKey('ArrowUp');
    frame(3000, 2950); // 입력이 없는 프레임
    engine.handleKeyDown('ArrowUp', noop);
    for (let i = 0; i < 10; i++) frame(3050 + i * 50, 3000 + i * 50);
    expect(blocked(events)).toHaveLength(2);
  });
});

/** 타이머를 직접 굴리는 시계. 숨은 탭처럼 발화 시각을 다음 1초 경계로 미루는 모드를 가진다 */
function simClock(alignToSecond: boolean) {
  let now = 1_000_000_000_000;
  let seq = 0;
  const timers = new Map<number, { due: number; fn: () => void }>();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.stubGlobal('setTimeout', (fn: () => void, ms = 0) => {
    const target = now + ms;
    const due = alignToSecond ? Math.ceil(target / 1000) * 1000 : target;
    seq += 1;
    timers.set(seq, { due, fn });
    return seq;
  });
  vi.stubGlobal('clearTimeout', (id: number) => { timers.delete(id); });
  const origin = now;
  return {
    origin,
    /** 정렬 없이 정확한 시각에 깨는 타이머 — 네트워크 지연을 흉내 낸다 */
    exactTimer(fn: () => void, ms: number) {
      seq += 1;
      timers.set(seq, { due: now + ms, fn });
    },
    async runUntil(end: number) {
      for (;;) {
        let nextId = -1;
        let nextDue = Infinity;
        for (const [id, t] of timers) if (t.due < nextDue) { nextDue = t.due; nextId = id; }
        if (nextId < 0 || nextDue > end) break;
        const t = timers.get(nextId)!;
        timers.delete(nextId);
        now = nextDue;
        vi.setSystemTime(now);
        t.fn();
        for (let i = 0; i < 5; i += 1) await Promise.resolve();
      }
      now = end;
      vi.setSystemTime(now);
    },
  };
}

describe('GameFieldEngine 방치 사이클 시간', () => {
  const RAND = 0.5;
  const WINDOW_MINUTES = 1;

  /**
   * 요청이 서버에 닿는 시간(업링크)과 응답이 돌아오는 시간을 흉내 내고, 서버 하한(catchTooSoon)을 서버 처리 시각으로 판정한다.
   * spikeMs가 null이면 지연이 없다. 숫자면 세 번에 한 번 업링크가 spikeMs만큼 더 걸린다.
   */
  async function runIdle(rod: number, alignToSecond: boolean, spikeMs: number | null, rand = RAND) {
    vi.spyOn(Math, 'random').mockReturnValue(rand);
    const clock = simClock(alignToSecond);
    const game = { ...newState(), rod };
    const engine = new GameFieldEngine('world', game, []);
    const serverTimes: number[] = [];
    let lastServerAt: string | null = null;
    let rejected = 0;
    let pending = false;
    let overlapped = 0;
    let requestIndex = 0;
    engine.updateContext(game, false, {
      dispatch: () => {
        if (pending) overlapped += 1;
        pending = true;
        const index = requestIndex;
        requestIndex += 1;
        const uplinkMs = spikeMs === null ? 0 : 50 + (index % 3 === 1 ? spikeMs : 0);
        const downlinkMs = spikeMs === null ? 0 : 50;
        return new Promise(resolve => {
          clock.exactTimer(() => {
            const serverAt = new Date(Date.now()).toISOString();
            if (catchTooSoon(game, 'pond', lastServerAt, serverAt)) {
              rejected += 1;
              clock.exactTimer(() => {
                pending = false;
                resolve({ status: 'rejected', error: 'too-fast' } as never);
              }, downlinkMs);
              return;
            }
            lastServerAt = serverAt;
            serverTimes.push(Date.now());
            clock.exactTimer(() => {
              pending = false;
              resolve({
                status: 'ok',
                result: { type: 'catch', fishId: 'carp', uid: 'u', info: { form: 'normal' }, released: [] },
              } as never);
            }, downlinkMs);
          }, uplinkMs);
        });
      },
      onEvent: noop,
      onScene: noop,
    });
    (engine as unknown as { school: unknown }).school = { id: 's', spot: 'pond', x: 0, y: 0 };
    (engine as unknown as { transition(p: string): void }).transition('wait');
    await clock.runUntil(clock.origin + 60_000 * WINDOW_MINUTES);
    engine.dispose();
    const gaps = serverTimes.slice(1).map((t, i) => t - serverTimes[i]);
    return { gaps, rejected, overlapped };
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const modelCycleMs = (rod: number) => (6 * Math.pow(0.94, rod - 1) + 1.4 + 2.0) * 1000;

  for (const rod of [25, 28, 30]) {
    it(`숨은 탭에서도 Lv${rod} 방치 사이클이 모델 시간에 1초 미만만 더해진다`, async () => {
      const { gaps, rejected } = await runIdle(rod, true, null);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      expect(gaps.length).toBeGreaterThan(8);
      expect(rejected).toBe(0);
      // 챔질 요청은 1초 정렬로 늦게 나가고 획득 카운트다운은 결과 도착부터 세므로, 모델보다 1초 미만으로 길 뿐 누적되지 않는다
      expect(mean).toBeGreaterThan(modelCycleMs(rod) - 60);
      expect(mean).toBeLessThan(modelCycleMs(rod) + 700);
    });

    it(`포그라운드 Lv${rod} 방치 사이클은 모델 시간과 같다`, async () => {
      const { gaps } = await runIdle(rod, false, null);
      for (const gap of gaps) expect(Math.abs(gap - modelCycleMs(rod))).toBeLessThan(5);
    });
  }

  for (const spike of [0, 900, 2000, 2600]) {
    for (const hidden of [false, true]) {
      it(`세 번에 한 번 업링크 +${spike}ms ${hidden ? '숨은 탭' : '포그라운드'}에서 서버 하한 거절이 없고 응답 전에 재캐스트하지 않는다`, async () => {
        const { gaps, rejected, overlapped } = await runIdle(25, hidden, spike, 0);
        expect(gaps.length).toBeGreaterThan(3);
        expect(rejected).toBe(0);
        expect(overlapped).toBe(0);
      });
    }
  }
});

describe('GameFieldEngine 도시락 입질 단축', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  const okCatch = { status: 'ok', result: { type: 'catch', fishId: 'carp', uid: 'u', info: { form: 'normal' }, released: [] } } as never;

  /** 첫 캐치를 judgment로 끝낸 뒤 이어지는 대기가 끝나기까지 걸리는 시간(ms)을 잰다 */
  function secondWaitMs(lunch: boolean, judgment: 'auto' | 'normal'): number {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const t0 = Date.parse('2026-11-12T00:00:00.000Z');
    vi.setSystemTime(t0);
    const game = {
      ...newState(), boat: 5, rod: 10,
      slots: { lunch: lunch ? { id: 'cook-lunch-bite', endsAt: new Date(t0 + 9 * 3600_000).toISOString() } : null, bait: null },
    };
    const engine = new GameFieldEngine('world', game, []);
    engine.updateContext(game, false, { dispatch: () => okCatch, onEvent: noop, onScene: noop });
    const raw = engine as unknown as { school: unknown; transition(p: string): void };
    raw.school = { id: 's', spot: 'pond', x: 0, y: 0 };
    raw.transition('wait');
    // 수동이면 입질 중에 눌러 첫 캐치를 수동으로 끝낸다. 방치면 타이머가 auto로 끝낸다
    if (judgment === 'normal') {
      let g = 0;
      while (engine.getSnapshot().phase !== 'bite' && g++ < 2000) vi.advanceTimersByTime(10);
      engine.action();
    }
    let guard = 0;
    while (engine.getSnapshot().phase !== 'catch' && guard++ < 5000) vi.advanceTimersByTime(10);
    guard = 0;
    while (engine.getSnapshot().phase !== 'wait' && guard++ < 5000) vi.advanceTimersByTime(10);
    const start = Date.now();
    guard = 0;
    while (engine.getSnapshot().phase === 'wait' && guard++ < 5000) vi.advanceTimersByTime(10);
    engine.dispose();
    return Date.now() - start;
  }

  it('방치 캐치 뒤의 대기는 도시락 입질 단축만큼 짧아진다', () => {
    const base = secondWaitMs(false, 'auto');
    const cut = secondWaitMs(true, 'auto');
    expect(cut).toBeLessThan(base * 0.95);
    expect(cut).toBeGreaterThan(base * 0.85);
  });
  it('수동 캐치 뒤의 대기에는 도시락 입질 단축을 넣지 않는다', () => {
    expect(secondWaitMs(true, 'normal')).toBe(secondWaitMs(false, 'normal'));
  });
});

describe('GameFieldEngine 게스트의 포구 출항', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // 포구 트리거 바로 위 부두에서 시작한다
  const aboveHarbor = { x: V_PORT.x + V_PORT.w / 2, y: V_PORT.y - 1 };

  function village({ guest, boat }: { guest: boolean; boat: number }) {
    const game = { ...newState(), boat };
    const engine = new GameFieldEngine('village', game, [], aboveHarbor);
    const onScene = vi.fn();
    const events: FieldEvent[] = [];
    engine.updateContext(game, false, {
      dispatch: () => ({ status: 'rejected', error: 'bad-request' }),
      onEvent: event => { events.push(event); },
      onScene,
      guest,
    });
    const frame = (now: number, last: number) =>
      (engine as unknown as { updateFrame(c: unknown, n: number, l: number): boolean }).updateFrame(ctx, now, last);
    return { engine, onScene, events, frame };
  }

  it('배가 있는 게스트는 장소를 바꾸지 않고 포구 앞으로 되밀리며 막혔다고 알린다', () => {
    const { engine, onScene, events, frame } = village({ guest: true, boat: 1 });
    engine.handleKeyDown('ArrowDown', noop);
    frame(1000, 950);
    expect(onScene).not.toHaveBeenCalled();
    expect(engine.getPosition()).toEqual(aboveHarbor);
    expect(events).toEqual([{ type: 'guest-blocked' }]);
  });

  it('막힌 채 계속 밀어도 알림은 한 번이고, 한 번 떨어졌다 다시 닿으면 다시 알린다', () => {
    const { engine, events, frame } = village({ guest: true, boat: 1 });
    engine.handleKeyDown('ArrowDown', noop);
    frame(1000, 950);
    frame(1050, 1000);
    frame(1100, 1050);
    expect(events.filter(event => event.type === 'guest-blocked')).toHaveLength(1);
    engine.releaseKey('ArrowDown');
    engine.handleKeyDown('ArrowUp', noop);
    frame(1150, 1100);
    engine.releaseKey('ArrowUp');
    engine.handleKeyDown('ArrowDown', noop);
    frame(1200, 1150);
    frame(1250, 1200);
    expect(events.filter(event => event.type === 'guest-blocked')).toHaveLength(2);
  });

  it('배가 없는 게스트는 배 없음 안내만 받고 게스트 막힘은 알리지 않는다', () => {
    const { engine, onScene, events, frame } = village({ guest: true, boat: 0 });
    engine.handleKeyDown('ArrowDown', noop);
    frame(1000, 950);
    expect(onScene).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: 'trigger-blocked', message: expect.stringContaining('배가 필요해요') }]);
  });

  it('게스트가 아니면 막히지 않고 바다로 나간다', () => {
    const { engine, onScene, events, frame } = village({ guest: false, boat: 1 });
    engine.handleKeyDown('ArrowDown', noop);
    frame(1000, 950);
    expect(onScene).toHaveBeenCalledTimes(1);
    expect(onScene.mock.calls[0][0]).toEqual({ kind: 'region', id: 'world' });
    expect(events).toEqual([]);
  });

  it('게스트의 집 출입은 막지 않는다', () => {
    const game = { ...newState(), boat: 1 };
    const engine = new GameFieldEngine('village', game, [], { x: 130, y: 90 });
    const onScene = vi.fn();
    engine.updateContext(game, false, { dispatch: () => ({ status: 'rejected', error: 'bad-request' }), onEvent: noop, onScene, guest: true });
    engine.handleKeyDown('ArrowUp', noop);
    (engine as unknown as { updateFrame(c: unknown, n: number, l: number): boolean }).updateFrame(ctx, 1000, 950);
    expect(onScene).toHaveBeenCalledTimes(1);
    expect(onScene.mock.calls[0][0]).toEqual({ kind: 'base', id: 'home' });
  });
});
