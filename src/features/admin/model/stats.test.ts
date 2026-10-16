import { describe, expect, it } from 'vitest';
import { BOATS } from '../../../game/content/boats';
import { selectAdminBoatOptions } from './stats';

describe('개발 도구 배 선택지', () => {
  it('배 표의 단계를 그대로 쓴다', () => {
    expect(selectAdminBoatOptions().map(o => o.tier)).toEqual(BOATS.map(b => b.tier));
  });
});
