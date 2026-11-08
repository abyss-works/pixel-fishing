import { describe, expect, it } from 'vitest';
import { BASE_PACKS, boardingOf } from './index';
import type { BaseId } from './index';

describe('boardingOf: 승선했을 때 나타나는 앞바다 자리', () => {
  const ports: BaseId[] = ['harbor', 'manila', 'colombo', 'toamasina', 'walvisbay'];

  it.each(ports)('%s는 거점 소속 지역의 exitAt과 exitMsg를 돌려준다', port => {
    const pack = BASE_PACKS[port];
    expect(boardingOf(port)).toEqual({ region: pack.region, at: pack.exitAt, msg: pack.exitMsg });
  });

  it('항구마다 앞바다 자리가 정해져 있다', () => {
    for (const port of ports) expect(boardingOf(port).at).toBeDefined();
  });
});
