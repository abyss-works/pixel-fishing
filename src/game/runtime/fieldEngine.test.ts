import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../rules/logic';
import { catchTooSoon } from '../rules/pacing';
import { HARBORS, WORLD_SPAWN } from '../world/regions/world';
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
