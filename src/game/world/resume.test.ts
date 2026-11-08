// 재접속 시작점 — 마지막 위치를 지역 출발점 대신 쓸 수 있는지 판정한다.
import { describe, expect, it } from 'vitest';
import { REGION_PACKS, canMove, resumePoint } from './index';

const world = REGION_PACKS.world;
const openWater = (() => {
  for (let y = world.bounds.y + 50; y < world.bounds.y + world.bounds.h; y += 7) for (let x = world.bounds.x + 50; x < world.bounds.x + world.bounds.w; x += 7) {
    if (canMove(world, x, y) && !world.triggers.some(t => x >= t.rect.x && x < t.rect.x + t.rect.w && y >= t.rect.y && y < t.rect.y + t.rect.h)) return { x, y };
  }
  throw new Error('no open water');
})();

describe('재접속 시작점', () => {
  it('같은 지역의 갈 수 있는 자리면 그 좌표에서 시작한다', () => {
    expect(resumePoint('world', { region: 'world', ...openWater })).toEqual(openWater);
  });

  it('기록이 없거나 지역이 다르면 출발점(null)이다', () => {
    expect(resumePoint('world', null)).toBeNull();
    expect(resumePoint('world', { region: 'village', ...openWater })).toBeNull();
  });

  it('막힌 자리, 지도 밖, 숫자가 아닌 좌표는 출발점(null)이다', () => {
    expect(resumePoint('world', { region: 'world', x: -10, y: -10 })).toBeNull();
    expect(resumePoint('world', { region: 'world', x: Number.NaN, y: 10 })).toBeNull();
    const land = (() => {
      for (let y = world.bounds.y + 10; y < world.bounds.y + world.bounds.h; y += 5) for (let x = world.bounds.x + 10; x < world.bounds.x + world.bounds.w; x += 5) if (!canMove(world, x, y)) return { x, y };
      throw new Error('no land');
    })();
    expect(resumePoint('world', { region: 'world', ...land })).toBeNull();
  });

  it('창 밖 좌표(원점이 창이던 시절의 기록 포함)는 출발점(null)이다', () => {
    // 옛 좌표계의 부산항 앞바다 자리 — 새 좌표계에서는 창 서쪽 밖이다
    expect(resumePoint('world', { region: 'world', x: 3088, y: 399 })).toBeNull();
    const { x, y, w, h } = world.bounds;
    expect(resumePoint('world', { region: 'world', x: x + w + 50, y: y + h / 2 })).toBeNull();
    expect(resumePoint('world', { region: 'world', x: x + w / 2, y: y - 50 })).toBeNull();
  });

  it('출발점(부산항 앞바다)은 갈 수 있는 자리이고 그 좌표에서 재개한다', () => {
    const { x, y } = world.spawn;
    expect(resumePoint('world', { region: 'world', x, y })).toEqual({ x, y });
  });

  it('이동 트리거 위의 자리는 다시 접속하자마자 이동하지 않도록 출발점(null)이다', () => {
    const pack = REGION_PACKS.village;
    const trig = pack.triggers[0];
    const inside = { x: trig.rect.x + trig.rect.w / 2, y: trig.rect.y + trig.rect.h / 2 };
    expect(resumePoint('village', { region: 'village', ...inside })).toBeNull();
  });
});
