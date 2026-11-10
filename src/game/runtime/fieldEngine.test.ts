import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../rules/logic';
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
    runUntil(end: number) {
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
      }
      now = end;
      vi.setSystemTime(now);
    },
  };
}

describe('GameFieldEngine 방치 사이클 시간', () => {
  const RAND = 0.5;
  const catchTimes: number[] = [];

  function runIdle(rod: number, alignToSecond: boolean, cycles: number): number[] {
    catchTimes.length = 0;
    vi.spyOn(Math, 'random').mockReturnValue(RAND);
    const clock = simClock(alignToSecond);
    const game = { ...newState(), rod };
    const engine = new GameFieldEngine('world', game, []);
    engine.updateContext(game, false, {
      dispatch: () => {
        catchTimes.push(Date.now());
        return {
          status: 'ok',
          result: { type: 'catch', fishId: 'carp', uid: 'u', info: { form: 'normal' }, released: [] },
        } as never;
      },
      onEvent: noop,
      onScene: noop,
    });
    (engine as unknown as { school: unknown }).school = { id: 's', spot: 'pond', x: 0, y: 0 };
    (engine as unknown as { transition(p: string): void }).transition('wait');
    clock.runUntil(clock.origin + 60_000 * cycles);
    engine.dispose();
    return catchTimes.slice();
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const modelCycleMs = (rod: number) => (6 * Math.pow(0.94, rod - 1) + 1.4 + 2.0) * 1000;

  for (const rod of [25, 28, 30]) {
    it(`숨은 탭에서도 Lv${rod} 방치 사이클이 모델 시간과 같다`, () => {
      const times = runIdle(rod, true, 1);
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      expect(gaps.length).toBeGreaterThan(8);
      // 1초 정렬은 요청 시각만 최대 1초 흔들 뿐이어서 평균 간격은 모델과 같다
      expect(Math.abs(mean - modelCycleMs(rod))).toBeLessThan(60);
      // 서버 하한(획득 표시 + 입질 최소 대기)보다 짧아지지 않는다
      const floor = 2000 + 4000 * Math.pow(0.94, rod - 1);
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(floor);
    });

    it(`포그라운드 Lv${rod} 방치 사이클은 모델 시간과 같다`, () => {
      const times = runIdle(rod, false, 1);
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      for (const gap of gaps) expect(Math.abs(gap - modelCycleMs(rod))).toBeLessThan(5);
    });
  }
});
