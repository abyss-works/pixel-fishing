import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../rules/logic';
import { HARBOR_DOCK, WORLD_SPAWN } from '../world/regions/world';
import { GameFieldEngine } from './fieldEngine';
import type { FieldEvent } from './fieldEngine';

vi.mock('../rendering/canvas/scenes/region.js', () => ({ renderRegion: vi.fn() }));

const ctx = {} as CanvasRenderingContext2D;
const noop = () => {};
const dockCenter = { x: HARBOR_DOCK.x + HARBOR_DOCK.w / 2, y: HARBOR_DOCK.y + HARBOR_DOCK.h / 2 };

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
